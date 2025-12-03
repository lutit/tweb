import {SliderSuperTab} from '../../slider';
import SettingSection from '../../settingSection';
import Row from '../../row';
import rootScope from '../../../lib/rootScope';
import {i18n, LangPackKey} from '../../../lib/langPack';
import getPeerTitle from '../../wrappers/getPeerTitle';
import wrapEmojiText from '../../../lib/richTextProcessor/wrapEmojiText';
import {formatFullSentTime} from '../../../helpers/date';
import {copyTextToClipboard} from '../../../helpers/clipboard';
import {toastNew} from '../../toast';
import debounce from '../../../helpers/schedulers/debounce';
import type {AyuDeletedMoment, AyuEditHistory, AyuEditRevision, AyuMomentsSnapshot} from '../../../lib/ayuMoments/types';
import {Message} from '../../../layer';

export default class AppAyuMomentsTab extends SliderSuperTab {
  private deletedSection: SettingSection;
  private editsSection: SettingSection;
  private deletedList: HTMLElement;
  private editsList: HTMLElement;
  private reloadDebounced: () => void;
  private loadPromise?: Promise<void>;

  public async init() {
    this.container.classList.add('general-settings-container');
    this.setTitle('ClientSettings.AyuMoments');

    this.deletedSection = new SettingSection({name: 'ClientSettings.AyuMoments.Deleted'});
    this.deletedList = this.createListContainer();
    this.deletedSection.content.append(this.deletedList);

    this.editsSection = new SettingSection({name: 'ClientSettings.AyuMoments.Edited'});
    this.editsList = this.createListContainer();
    this.editsSection.content.append(this.editsList);

    this.scrollable.append(this.deletedSection.container, this.editsSection.container);

    this.reloadDebounced = debounce(() => this.loadAndRender(), 150);
    this.listenerSetter.add(rootScope)('ayu_moments_update', () => this.reloadDebounced());

    await this.loadAndRender();
  }

  private createListContainer() {
    const list = document.createElement('div');
    list.classList.add('ayu-moments-list');
    return list;
  }

  private async loadAndRender() {
    if(this.loadPromise) return this.loadPromise;

    const managers = rootScope.managers;
    if(!managers?.appAyuMomentsManager) return;

    const promise = managers.appAyuMomentsManager.getSnapshot()
      .then((snapshot) => this.renderSnapshot(snapshot))
      .catch((error) => console.error('[AyuMomentsTab] failed to load snapshot', error))
      .finally(() => {
        if(this.loadPromise === promise) {
          this.loadPromise = undefined;
        }
      });

    this.loadPromise = promise;
    return promise;
  }

  private async renderSnapshot(snapshot: AyuMomentsSnapshot) {
    await Promise.all([
      this.renderDeleted(snapshot.deleted),
      this.renderEdits(snapshot.edits)
    ]);
  }

  private clearList(container: HTMLElement) {
    while(container.firstChild) {
      container.firstChild.remove();
    }
  }

  private createEmptyPlaceholder(key: LangPackKey) {
    const empty = document.createElement('div');
    empty.classList.add('ayu-moment-empty');
    empty.append(i18n(key));
    return empty;
  }

  private async renderDeleted(moments: AyuDeletedMoment[]) {
    this.clearList(this.deletedList);
    if(!moments.length) {
      this.deletedList.append(this.createEmptyPlaceholder('ClientSettings.AyuMoments.EmptyDeleted' as LangPackKey));
      return;
    }

    for(const moment of moments) {
      const entry = await this.createDeletedEntry(moment);
      this.deletedList.append(entry);
    }
  }

  private async renderEdits(histories: AyuEditHistory[]) {
    this.clearList(this.editsList);
    if(!histories.length) {
      this.editsList.append(this.createEmptyPlaceholder('ClientSettings.AyuMoments.EmptyEdits' as LangPackKey));
      return;
    }

    for(const history of histories) {
      const entry = await this.createEditEntry(history);
      this.editsList.append(entry);
    }
  }

  private async createDeletedEntry(moment: AyuDeletedMoment) {
    const wrapper = document.createElement('div');
    wrapper.classList.add('ayu-moment-entry');

    const peerTitle = await getPeerTitle({peerId: moment.peerId, plainText: true, managers: rootScope.managers}) as string;
    const row = new Row({
      title: peerTitle,
      subtitle: this.buildMessagePreview(moment.message),
      titleRight: formatFullSentTime(moment.timestamp, undefined, true),
      listenerSetter: this.listenerSetter
    });
    row.container.classList.add('ayu-moment-row');

    const badge = this.createReasonBadge(moment.reason);
    badge && row.container.append(badge);

    wrapper.append(row.container, this.createActions(moment.id, moment.message));
    return wrapper;
  }

  private async createEditEntry(history: AyuEditHistory) {
    const wrapper = document.createElement('div');
    wrapper.classList.add('ayu-moment-entry', 'ayu-moment-entry--with-revisions');

    const peerTitle = await getPeerTitle({peerId: history.peerId, plainText: true, managers: rootScope.managers}) as string;
    const row = new Row({
      title: `${peerTitle} • #${history.messageId}`,
      subtitle: i18n('ClientSettings.AyuMoments.RevisionCount', [history.revisions.length]),
      titleRight: formatFullSentTime(history.lastUpdatedAt, undefined, true),
      listenerSetter: this.listenerSetter,
      clickable: () => wrapper.classList.toggle('is-open')
    });
    row.container.classList.add('ayu-moment-row');
    row.container.append(this.createReasonBadge('edit'));

    wrapper.append(row.container, this.createRevisionList(history));
    return wrapper;
  }

  private createRevisionList(history: AyuEditHistory) {
    const container = document.createElement('div');
    container.classList.add('ayu-moment-revisions');

    history.revisions.forEach((revision) => {
      const item = document.createElement('div');
      item.classList.add('ayu-moment-revision');

      const header = document.createElement('div');
      header.classList.add('ayu-moment-revision__header');
      header.append(`#${revision.revision}`);

      const time = document.createElement('span');
      time.classList.add('ayu-moment-revision__time');
      time.append(formatFullSentTime(revision.timestamp, undefined, true));
      header.append(time);

      const body = document.createElement('div');
      body.classList.add('ayu-moment-revision__body');
      body.append(this.buildMessagePreview(revision.message));

      item.append(header, body, this.createActions(revision.id, revision.message));
      container.append(item);
    });

    return container;
  }

  private buildMessagePreview(message: Message.message | Message.messageService) {
    const plain = this.extractMessageText(message);
    const fallback = i18n('ClientSettings.AyuMoments.Attachment').textContent || '';
    const text = plain || fallback;
    return wrapEmojiText(text);
  }

  private extractMessageText(message: Message.message | Message.messageService) {
    if(!message) return '';
    if(message._ === 'message' && message.message?.trim()) {
      return message.message.trim();
    }

    return '';
  }

  private createReasonBadge(reason: string) {
    const key = this.getReasonKey(reason);
    if(!key) return null;

    const badge = document.createElement('span');
    badge.classList.add('ayu-moment-badge');
    badge.append(i18n(key));
    return badge;
  }

  private getReasonKey(reason: string): LangPackKey | undefined {
    switch(reason) {
      case 'manual_keep':
        return 'ClientSettings.AyuMoments.Reason.Manual';
      case 'ttl':
        return 'ClientSettings.AyuMoments.Reason.TTL';
      case 'edit':
        return 'ClientSettings.AyuMoments.Reason.Edit';
      default:
        return 'ClientSettings.AyuMoments.Reason.Remote';
    }
  }

  private createActions(id: string, message: Message.message | Message.messageService) {
    const actions = document.createElement('div');
    actions.classList.add('ayu-moment-actions');

    actions.append(this.createActionButton('ClientSettings.AyuMoments.Action.Copy', async() => {
      const text = this.extractMessageText(message);
      if(!text) {
        toastNew({langPackKey: 'ClientSettings.AyuMoments.Toast.NoText'});
        return;
      }

      await copyTextToClipboard(text);
      toastNew({langPackKey: 'ClientSettings.AyuMoments.Toast.Copied'});
    }));

    actions.append(this.createActionButton('ClientSettings.AyuMoments.Action.Remove', async() => {
      await rootScope.managers.appAyuMomentsManager.deleteMoment(id);
    }));

    return actions;
  }

  private createActionButton(langKey: LangPackKey, handler: () => Promise<void>) {
    const button = document.createElement('button');
    button.type = 'button';
    button.classList.add('ayu-moment-action');
    button.append(i18n(langKey));
    this.listenerSetter.add(button)('click', () => handler());
    return button;
  }
}

import PopupElement from '.';
import {i18n, LangPackKey, _i18n} from '../../lib/langPack';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import {formatFullSentTime} from '../../helpers/date';
import {copyTextToClipboard} from '../../helpers/clipboard';
import {toastNew} from '../toast';
import type {AyuDeletedMoment, AyuEditHistory, AyuEditRevision} from '../../lib/ayuMoments/types';
import rootScope from '../../lib/rootScope';
import getPeerTitle from '../wrappers/getPeerTitle';
import type {Message} from '../../layer';

export type PopupAyuMomentsHistoryOptions = {
  titleKey: LangPackKey,
  titleArgs?: any[],
  history?: AyuEditHistory,
  deleted?: AyuDeletedMoment[],
  histories?: AyuEditHistory[]
};

export default class PopupAyuMomentsHistory extends PopupElement {
  constructor(options: PopupAyuMomentsHistoryOptions) {
    super('popup-ayu-moments', {
      title: true,
      overlayClosable: true,
      scrollable: true,
      body: true
    });

    _i18n(this.title, options.titleKey, options.titleArgs);

    if(options.history) {
      this.renderHistory(options.history);
    } else {
      this.renderSnapshot(options.deleted || [], options.histories || []);
    }
  }

  private renderHistory(history: AyuEditHistory) {
    const container = document.createElement('div');
    container.classList.add('ayu-moments-list');
    if(!history.revisions.length) {
      container.append(this.createEmpty('ClientSettings.AyuMoments.EmptyEdits'));
    } else {
      history.revisions.forEach((revision) => {
        container.append(this.createRevisionEntry(revision));
      });
    }

    this.body.append(container);
  }

  private renderSnapshot(deleted: AyuDeletedMoment[], histories: AyuEditHistory[]) {
    const deletedSection = this.createSection('ClientSettings.AyuMoments.Deleted');
    if(deleted.length) {
      deleted.forEach((moment) => {
        deletedSection.append(this.createDeletedEntry(moment));
      });
    } else {
      deletedSection.append(this.createEmpty('ClientSettings.AyuMoments.EmptyDeleted'));
    }

    const editsSection = this.createSection('ClientSettings.AyuMoments.Edited');
    if(histories.length) {
      histories.forEach((history) => {
        editsSection.append(this.createHistoryEntry(history));
      });
    } else {
      editsSection.append(this.createEmpty('ClientSettings.AyuMoments.EmptyEdits'));
    }

    this.body.append(deletedSection, editsSection);
  }

  private createSection(titleKey: LangPackKey) {
    const wrapper = document.createElement('div');
    wrapper.classList.add('ayu-moment-entry');

    const title = document.createElement('div');
    title.classList.add('row-title');
    title.append(i18n(titleKey));

    wrapper.append(title);
    return wrapper;
  }

  private createDeletedEntry(moment: AyuDeletedMoment) {
    const container = document.createElement('div');
    container.classList.add('ayu-moment-entry');

    const header = document.createElement('div');
    header.classList.add('row-title-row');
    header.append(`#${moment.messageId}`);

    const time = document.createElement('span');
    time.classList.add('ayu-moment-revision__time');
    time.append(formatFullSentTime(moment.timestamp, undefined, true));
    header.append(time);

    const body = document.createElement('div');
    body.classList.add('ayu-moment-revision__body');
    body.append(this.buildMessagePreview(moment.message));

    container.append(header, body, this.createActions(moment.id, moment.message));
    return container;
  }

  private createHistoryEntry(history: AyuEditHistory) {
    const container = document.createElement('div');
    container.classList.add('ayu-moment-entry', 'ayu-moment-entry--with-revisions');

    const row = document.createElement('div');
    row.classList.add('row-title-row');
    row.append(`#${history.messageId}`);

    const meta = document.createElement('span');
    meta.classList.add('ayu-moment-revision__time');
    meta.append(i18n('ClientSettings.AyuMoments.RevisionCount', [history.revisions.length]));
    row.append(meta);

    row.addEventListener('click', () => {
      container.classList.toggle('is-open');
    });

    const revisions = document.createElement('div');
    revisions.classList.add('ayu-moment-revisions');
    history.revisions.forEach((revision) => {
      revisions.append(this.createRevisionEntry(revision));
    });

    container.append(row, revisions);
    return container;
  }

  private createRevisionEntry(revision: AyuEditRevision) {
    const entry = document.createElement('div');
    entry.classList.add('ayu-moment-revision');

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

    entry.append(header, body, this.createActions(revision.id, revision.message));
    return entry;
  }

  private buildMessagePreview(message: Message.message | Message.messageService) {
    const text = this.extractMessageText(message) || i18n('ClientSettings.AyuMoments.Attachment').textContent || '';
    return wrapEmojiText(text);
  }

  private extractMessageText(message: Message.message | Message.messageService) {
    if(!message) return '';
    if(message._ === 'message' && message.message?.trim()) {
      return message.message.trim();
    }

    return '';
  }

  private createActions(id: string, message: Message.message | Message.messageService) {
    const actions = document.createElement('div');
    actions.classList.add('ayu-moment-actions');

    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.classList.add('ayu-moment-action');
    copyButton.append(i18n('ClientSettings.AyuMoments.Action.Copy'));
    copyButton.addEventListener('click', async() => {
      const text = this.extractMessageText(message);
      if(!text) {
        toastNew({langPackKey: 'ClientSettings.AyuMoments.Toast.NoText'});
        return;
      }

      await copyTextToClipboard(text);
      toastNew({langPackKey: 'ClientSettings.AyuMoments.Toast.Copied'});
    });

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.classList.add('ayu-moment-action');
    deleteButton.append(i18n('ClientSettings.AyuMoments.Action.Remove'));
    deleteButton.addEventListener('click', () => {
      rootScope.managers.appAyuMomentsManager.deleteMoment(id);
      deleteButton.closest('.ayu-moment-entry')?.remove();
    });

    actions.append(copyButton, deleteButton);
    return actions;
  }

  private createEmpty(key: LangPackKey) {
    const empty = document.createElement('div');
    empty.classList.add('ayu-moment-empty');
    empty.append(i18n(key));
    return empty;
  }
}

export async function openMessageHistory(peerId: PeerId, mid: number) {
  const manager = rootScope.managers?.appAyuMomentsManager;
  if(!manager) {
    console.warn('[AyuMoments] manager not available for message history');
    return;
  }

  const history = await manager.getEditHistory(peerId, mid);
  if(!history || !history.revisions.length) {
    console.warn('[AyuMoments] no history for message', peerId, mid);
    toastNew({langPackKey: 'ClientSettings.AyuMoments.EmptyEdits'});
    return;
  }

  const title = await getPeerTitle({peerId, plainText: true});
  PopupElement.createPopup(PopupAyuMomentsHistory, {
    titleKey: 'ClientSettings.AyuMoments.Popup.Title.Message',
    titleArgs: [title],
    history
  }).show();
}

export async function openChatHistory(peerId: PeerId) {
  const manager = rootScope.managers?.appAyuMomentsManager;
  if(!manager) {
    console.warn('[AyuMoments] manager not available for chat history');
    return;
  }

  const snapshot = await manager.getPeerSnapshot(peerId);
  if(!snapshot.deleted.length && !snapshot.edits.length) {
    console.warn('[AyuMoments] no snapshot data for peer', peerId);
    toastNew({langPackKey: 'ClientSettings.AyuMoments.EmptyDeleted'});
    return;
  }

  const title = await getPeerTitle({peerId, plainText: true});
  PopupElement.createPopup(PopupAyuMomentsHistory, {
    titleKey: 'ClientSettings.AyuMoments.Popup.Title.Chat',
    titleArgs: [title],
    deleted: snapshot.deleted,
    histories: snapshot.edits
  }).show();
}

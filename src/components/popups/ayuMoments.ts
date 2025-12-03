import PopupElement from '.';
import {i18n, LangPackKey, _i18n} from '../../lib/langPack';
import {formatFullSentTime} from '../../helpers/date';
import {toastNew} from '../toast';
import type {AyuDeletedMoment, AyuEditHistory, AyuEditRevision} from '../../lib/ayuMoments/types';
import rootScope from '../../lib/rootScope';
import getPeerTitle from '../wrappers/getPeerTitle';
import type {Message} from '../../layer';
import Row from '../row';
import SettingSection from '../settingSection';
import {copyTextToClipboard} from '../../helpers/clipboard';

export type PopupAyuMomentsHistoryOptions = {
  titleKey: LangPackKey,
  titleArgs?: any[],
  history?: AyuEditHistory,
  deleted?: AyuDeletedMoment[]
};

export default class PopupAyuMomentsHistory extends PopupElement {
  private peerTitles = new Map<PeerId, string>();

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
      this.renderDeletedSnapshot(options.deleted || []);
    }
  }

  private renderHistory(history: AyuEditHistory) {
    const section = new SettingSection({name: 'ClientSettings.AyuMoments.Edited'});
    if(!history.revisions.length) {
      section.content.append(this.createEmptyRow('ClientSettings.AyuMoments.EmptyEdits'));
    } else {
      history.revisions.forEach((revision) => {
        section.content.append(this.createRevisionRow(revision).container);
      });
    }

    this.body.append(section.container);
  }

  private renderDeletedSnapshot(deleted: AyuDeletedMoment[]) {
    const section = new SettingSection({name: 'ClientSettings.AyuMoments.Deleted'});
    const sorted = [...deleted].sort((a, b) => b.timestamp - a.timestamp);
    if(!sorted.length) {
      section.content.append(this.createEmptyRow('ClientSettings.AyuMoments.EmptyDeleted'));
    } else {
      sorted.forEach((moment) => {
        const row = this.createDeletedRow(moment);
        section.content.append(row.container);
        this.fillSubtitleAsync(moment, row);
      });
    }

    this.body.append(section.container);
  }

  private createRevisionRow(revision: AyuEditRevision) {
    return new Row({
      title: this.getMessagePreview(revision.message),
      subtitle: this.composeHistorySubtitle(revision),
      havePadding: true,
      listenerSetter: this.listenerSetter
    });
  }

  private getMessagePreview(message: Message.message | Message.messageService, allowFallback = true) {
    if(!message) return '';
    if(message._ === 'message' && message.message?.trim()) {
      return message.message.trim();
    }

    return allowFallback ? (i18n('ClientSettings.AyuMoments.Attachment').textContent || '') : '';
  }

  private composeHistorySubtitle(revision: AyuEditRevision) {
    const formatted = formatFullSentTime(revision.timestamp, true, true).textContent?.trim() || '';
    return `#${revision.revision} • ${formatted}`;
  }
  private createEmptyRow(key: LangPackKey) {
    const row = new Row({
      titleLangKey: key,
      havePadding: true,
      listenerSetter: this.listenerSetter
    });
    return row.container;
  }

  private createDeletedRow(moment: AyuDeletedMoment) {
    return new Row({
      title: this.getMessagePreview(moment.message),
      subtitle: this.composeDeletedSubtitle(moment, ''),
      havePadding: true,
      listenerSetter: this.listenerSetter,
      clickable: () => this.copyDeletedMessage(moment),
      contextMenu: {
        buttons: [
          {
            text: 'Copy',
            onClick: () => this.copyDeletedMessage(moment)
          },
          {
            regularText: this.composeDetailsString(moment),
            onClick: () => {}
          }
        ]
      }
    });
  }

  private async fillSubtitleAsync(moment: AyuDeletedMoment, row: Row) {
    const peerTitle = await this.getPeerTitle(moment.peerId);
    row.subtitle.textContent = this.composeDeletedSubtitle(moment, peerTitle);
  }

  private composeDeletedSubtitle(moment: AyuDeletedMoment, peerTitle: string) {
    const parts = [`#${moment.messageId}`];
    if(peerTitle) {
      parts.push(peerTitle);
    }
    const formatted = formatFullSentTime(moment.timestamp, true, true).textContent?.trim() || '';
    parts.push(formatted);
    return parts.join(' • ');
  }

  private composeDetailsString(moment: AyuDeletedMoment) {
    const reason = this.getReasonTitle(moment.reason);
    const savedAt = formatFullSentTime(moment.timestamp, true, true).textContent?.trim() || '';
    return `#${moment.messageId} · ${reason} · ${savedAt}`;
  }

  private getReasonTitle(reason: AyuDeletedMoment['reason']) {
    switch(reason) {
      case 'manual_keep':
        return i18n('ClientSettings.AyuMoments.Reason.Manual').textContent || '';
      case 'ttl':
        return i18n('ClientSettings.AyuMoments.Reason.TTL').textContent || '';
      case 'edit':
        return i18n('ClientSettings.AyuMoments.Reason.Edit').textContent || '';
      default:
        return i18n('ClientSettings.AyuMoments.Reason.Remote').textContent || '';
    }
  }

  private async copyDeletedMessage(moment: AyuDeletedMoment) {
    const text = this.getMessagePreview(moment.message, false);
    if(!text) {
      toastNew({langPackKey: 'ClientSettings.AyuMoments.Toast.NoText'});
      return;
    }

    await copyTextToClipboard(text);
    toastNew({langPackKey: 'TextCopied'});
  }

  private async getPeerTitle(peerId: PeerId) {
    if(this.peerTitles.has(peerId)) {
      return this.peerTitles.get(peerId);
    }

    const title = await getPeerTitle({peerId, plainText: true});
    this.peerTitles.set(peerId, title);
    return title;
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
  if(!snapshot.deleted.length) {
    console.warn('[AyuMoments] no deleted data for peer', peerId);
    toastNew({langPackKey: 'ClientSettings.AyuMoments.EmptyDeleted'});
    return;
  }

  const title = await getPeerTitle({peerId, plainText: true});
  PopupElement.createPopup(PopupAyuMomentsHistory, {
    titleKey: 'ClientSettings.AyuMoments.Popup.Title.Chat',
    titleArgs: [title],
    deleted: snapshot.deleted
  }).show();
}

import copy from '../../helpers/object/copy';
import SlicedArray, {SliceEnd} from '../../helpers/slicedArray';
import {_useHistoryStorage} from '../../stores/historyStorages';
import getPeerTitle from '../../components/wrappers/getPeerTitle';
import {toastNew} from '../../components/toast';
import {ChatType} from '../../components/chat/chat';
import appImManager, {VirtualPeerDescriptor} from '../appManagers/appImManager';
import type {MyMessage} from '../appManagers/appMessagesManager';
import type {Message} from '../../layer';
import {AyuDeletedMoment, AyuEditHistory, AyuMomentReason, AyuMomentType} from './types';
import rootScope from '../rootScope';
import {i18n} from '../langPack';
import {registerVirtualChatSession} from '../virtualChats/registry';
import appNavigationController from '../../components/appNavigationController';
import createHistoryStorage from '../appManagers/utils/messages/createHistoryStorage';

type AyuMomentsChatMode = 'deleted' | 'edited';

type BuildSessionOptions = {
  peerId: PeerId;
  focusOriginalMid?: number;
  entries: VirtualMomentEntry[];
};

type VirtualMomentEntry = {
  message: MyMessage;
  capturedAt: number;
  originalMid: number;
  reason: AyuMomentReason;
  type: AyuMomentType;
  revision?: number;
  snapshotId: string;
};

const SESSION_PREFIX = 'ayu-moments';
const VIRTUAL_MID_BASE = 0x70000000;

export type AyuMomentsVirtualChatOptions = {
  peerId: PeerId;
  focusOriginalMid?: number;
  skipNavigation?: boolean;
  mode?: AyuMomentsChatMode;
  editedFilterMid?: number;
};

export async function openAyuMomentsVirtualChat(options: AyuMomentsVirtualChatOptions) {
  const mode: AyuMomentsChatMode = options.mode ?? 'deleted';
  const manager = rootScope.managers?.appAyuMomentsManager;
  if(!manager) {
    toastNew({langPackKey: 'ClientSettings.AyuMoments.EmptyDeleted'});
    return;
  }

  if(!options.skipNavigation) {
    const params = new URLSearchParams({
      peer: String(options.peerId),
      mode
    });
    if(options.focusOriginalMid) {
      params.set('mid', String(options.focusOriginalMid));
    }
    if(options.editedFilterMid) {
      params.set('filter', String(options.editedFilterMid));
    }
    appNavigationController.overrideHash(`#/local/ayumoments?${params.toString()}`);
  }

  const snapshot = await manager.getPeerSnapshot(options.peerId);
  const entries = normalizeSnapshot({
    deleted: snapshot.deleted,
    edits: snapshot.edits,
    peerId: options.peerId,
    mode,
    editedFilterMid: options.editedFilterMid
  });
  if(!entries.length) {
    toastNew({
      langPackKey: mode === 'edited' ? 'ClientSettings.AyuMoments.EmptyEdits' : 'ClientSettings.AyuMoments.EmptyDeleted'
    });
    return;
  }

  const sessionKey = generateSessionKey(mode);
  const {historyStorage, historyKey, focusVirtualMid, lastMid, messagesMap} = buildVirtualSession({
    peerId: options.peerId,
    focusOriginalMid: options.focusOriginalMid,
    entries
  }, sessionKey);

  const peerTitle = await getPeerTitle({peerId: options.peerId, plainText: true});
  const title = (mode === 'edited' ?
    i18n('ClientSettings.AyuMoments.Popup.Title.Edits', [peerTitle]) :
    i18n('ClientSettings.AyuMoments.Popup.Title.Chat', [peerTitle])
  ).textContent || peerTitle;
  const subtitle = i18n('SavedMessagesCount', [entries.length]).textContent || String(entries.length);

  registerVirtualChatSession({
    key: sessionKey,
    historyKey,
    historyStorage,
    peerId: options.peerId,
    messagesByMid: messagesMap,
    focusVirtualMid
  });

  const virtualPeer: VirtualPeerDescriptor = {
    key: sessionKey,
    title,
    subtitle,
    layout: 'forum'
  };

  await appImManager.setPeer({
    peerId: options.peerId,
    type: ChatType.Virtual,
    lastMsgId: focusVirtualMid ?? lastMid,
    virtualPeer
  });
}

function normalizeSnapshot({
  deleted,
  edits,
  peerId,
  mode,
  editedFilterMid
}: {
  deleted: AyuDeletedMoment[],
  edits: AyuEditHistory[],
  peerId: PeerId,
  mode: AyuMomentsChatMode,
  editedFilterMid?: number
}) {
  const entries: VirtualMomentEntry[] = [];

  if(mode === 'deleted') {
    deleted.forEach((moment) => {
      entries.push({
        message: copy(moment.message),
        capturedAt: moment.timestamp,
        originalMid: moment.messageId,
        reason: moment.reason,
        type: 'deleted',
        snapshotId: moment.id
      });
    });
  } else {
    edits.forEach((history) => {
      if(editedFilterMid && history.messageId !== editedFilterMid) {
        return;
      }
      history.revisions.forEach((revision) => {
        const clonedMessage = copy(revision.message);
        delete (clonedMessage as Message.message).edit_date;
        (clonedMessage as Message.message).pFlags ||= {};
        (clonedMessage as Message.message).pFlags.edit_hide = true;
        entries.push({
          message: clonedMessage,
          capturedAt: revision.timestamp,
          originalMid: revision.messageId,
          reason: revision.reason,
          type: 'edited',
          revision: revision.revision,
          snapshotId: revision.id
        });
      });
    });
  }

  entries.forEach((entry) => {
    entry.message.peerId = peerId;
  });

  entries.sort((a, b) => b.capturedAt - a.capturedAt);
  return entries;
}

function buildVirtualSession(options: BuildSessionOptions, sessionKey: string) {
  const historyStorage = createHistoryStorage({
    type: 'history',
    peerId: options.peerId,
    virtualKey: sessionKey
  });
  historyStorage.history ??= new SlicedArray();

  const index = buildMessagesIndex(options.entries);
  const mids = index.mids;
  const focusVirtualMid = options.focusOriginalMid ? index.byOriginalMid.get(options.focusOriginalMid) : undefined;

  historyStorage.history.insertSlice(mids);
  const slice = historyStorage.history.first;
  slice.setEnd(SliceEnd.Both);
  historyStorage.count = mids.length;
  historyStorage._maxId = mids[0];
  historyStorage.wasFetched = true;

  const historyKey = historyStorage.key;
  if(historyKey) {
    const [, setHistoryStorage] = _useHistoryStorage(historyKey);
    setHistoryStorage('history', historyStorage.history);
    if(historyStorage.searchHistory) {
      setHistoryStorage('searchHistory', historyStorage.searchHistory);
    }
    setHistoryStorage('_maxId', historyStorage._maxId);
    setHistoryStorage('count', historyStorage.count);
    setHistoryStorage('wasFetched', historyStorage.wasFetched);
  }

  return {
    historyStorage,
    historyKey,
    focusVirtualMid,
    lastMid: mids[0],
    messagesMap: index.map
  };
}

function buildMessagesIndex(entries: VirtualMomentEntry[]) {
  const map = new Map<number, MyMessage>();
  const byOriginalMid = new Map<number, number>();
  const mids: number[] = [];
  const total = entries.length;

  entries.forEach((entry, index) => {
    const virtualMid = VIRTUAL_MID_BASE + (total - index);
    entry.message.mid = virtualMid;
    (entry.message as any).id = virtualMid;
    (entry.message as any).ayuMoment = {
      id: entry.snapshotId,
      type: entry.type,
      reason: entry.reason,
      capturedAt: entry.capturedAt,
      originalMid: entry.originalMid,
      revision: entry.revision
    };
    map.set(virtualMid, entry.message);
    byOriginalMid.set(entry.originalMid, virtualMid);
    mids.push(virtualMid);
  });

  return {map, mids, byOriginalMid};
}

function generateSessionKey(mode: AyuMomentsChatMode) {
  return `${SESSION_PREFIX}-${mode}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

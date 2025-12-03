import type {HistoryStorage, HistoryStorageKey, MyMessage} from '../appManagers/appMessagesManager';
import {_deleteHistoryStorage} from '../../stores/historyStorages';

export type VirtualChatSession = {
  key: string;
  historyKey: HistoryStorageKey;
  historyStorage: HistoryStorage;
  peerId: PeerId;
  messagesByMid: Map<number, MyMessage>;
  focusVirtualMid?: number;
};

const sessions = new Map<string, VirtualChatSession>();

export function registerVirtualChatSession(session: VirtualChatSession) {
  sessions.set(session.key, session);
  return session;
}

export function getVirtualChatSession(key: string) {
  return sessions.get(key);
}

export function unregisterVirtualChatSession(key: string) {
  const session = sessions.get(key);
  sessions.delete(key);
  if(session) {
    _deleteHistoryStorage(session.historyKey);
  }
}

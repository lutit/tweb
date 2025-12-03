import {AppManager} from './manager';
import AppStorage from '../storage';
import {getDatabaseState} from '../../config/databases/state';
import tsNow from '../../helpers/tsNow';
import copy from '../../helpers/object/copy';
import type {AccountDatabase} from '../../config/databases/state';
import type {Message} from '../../layer';
import type {StateSettings} from '../../config/state';
import {
  AyuDeletedMoment,
  AyuEditHistory,
  AyuEditRevision,
  AyuMomentReason,
  AyuMomentsStorageValue,
  AyuMomentType
} from '../ayuMoments/types';
import {getAyuMomentsSettings} from '../ayuMoments/settings';
import type {AyuMomentsSettings} from '../ayuMoments/settings';

type StorageShape = Record<string, AyuMomentsStorageValue>;

const SKIP_CACHE_TTL = 5 * 60 * 1000;
const MAX_ENTRIES = 2000;

export default class AppAyuMomentsManager extends AppManager {
  protected name = 'AYU_MOMENTS';

  private storage: AppStorage<StorageShape, AccountDatabase>;
  private readyPromise: Promise<void>;
  private entries = new Map<string, AyuMomentsStorageValue>();
  private order: {id: string, timestamp: number}[] = [];
  private deletedByKey = new Map<string, AyuDeletedMoment>();
  private editsByKey = new Map<string, AyuEditHistory>();
  private skipDeletionKeys = new Map<string, number>();
  private settingsCache: AyuMomentsSettings | undefined = getAyuMomentsSettings();

  protected after() {
    this.storage = new AppStorage(getDatabaseState(this.getAccountNumber()), 'ayuMoments');
    this.readyPromise = this.restoreFromStorage();

    this.rootScope.addEventListener('settings_updated', (payload) => {
      const {key, settings} = payload;
      if(!key.startsWith('settings.client.ayuMoments')) return;
      this.updateSettings(settings);
    });
  }

  private updateSettings(settings: StateSettings) {
    this.settingsCache = getAyuMomentsSettings(settings);
  }

  private async restoreFromStorage() {
    const entries = await this.storage.getAllEntries();
    entries.forEach(([id, value]) => {
      if(!value) return;
      this.entries.set(id as string, value);
      this.insertOrder(value);
      if(value.type === 'deleted') {
        this.deletedByKey.set(this.getMessageKey(value.peerId, value.messageId), value);
      } else {
        this.insertRevision(value);
      }
    });
  }

  private ensureReady() {
    return this.readyPromise ?? Promise.resolve();
  }

  private getMessageKey(peerId: PeerId, messageId: number) {
    return `${peerId}_${messageId}`;
  }

  private insertOrder(value: AyuMomentsStorageValue) {
    const entry = {id: value.id, timestamp: value.timestamp};
    const index = this.order.findIndex((current) => current.timestamp > entry.timestamp);
    if(index === -1) this.order.push(entry);
    else this.order.splice(index, 0, entry);
  }

  private removeFromOrder(id: string) {
    const index = this.order.findIndex((entry) => entry.id === id);
    if(index !== -1) {
      this.order.splice(index, 1);
    }
  }

  private enforceLimit() {
    while(this.order.length > MAX_ENTRIES) {
      const oldest = this.order.shift();
      if(oldest) {
        this.removeSnapshot(oldest.id, /* silent */true);
      }
    }
  }

  private sanitizeMessage<T extends Message.message | Message.messageService>(message: T): T {
    const cloned = copy(message);
    delete (cloned as any).promise;
    delete (cloned as any).send;
    delete (cloned as any).storageKey;
    delete (cloned as any).pending;
    delete (cloned as any).error;
    delete (cloned as any).repayRequest;
    return cloned;
  }

  private shouldCaptureDeletion(peerId: PeerId) {
    const settings = this.settingsCache;
    if(!settings?.saveDeleted) {
      return false;
    }

    const isBot = this.appPeersManager.isBot(peerId);
    return !isBot || settings.includeBots;
  }

  private shouldCaptureEdit(peerId: PeerId) {
    const settings = this.settingsCache;
    if(!settings?.saveEdited) {
      return false;
    }

    const isBot = this.appPeersManager.isBot(peerId);
    return !isBot || settings.includeBots;
  }

  private cleanSkipCache() {
    const now = Date.now();
    for(const [key, timestamp] of this.skipDeletionKeys) {
      if(now - timestamp > SKIP_CACHE_TTL) {
        this.skipDeletionKeys.delete(key);
      }
    }
  }

  private shouldSkipKey(key: string) {
    this.cleanSkipCache();
    if(this.skipDeletionKeys.has(key)) {
      this.skipDeletionKeys.delete(key);
      return true;
    }

    return false;
  }

  private markSkipKeys(peerId: PeerId, mids: number[]) {
    const now = Date.now();
    mids.forEach((mid) => this.skipDeletionKeys.set(this.getMessageKey(peerId, mid), now));
  }

  public async registerDeletionSkip(peerId: PeerId, mids: number[]) {
    await this.ensureReady();
    this.markSkipKeys(peerId, mids);
  }

  public async keepLocallyBeforeDelete(peerId: PeerId, mids: number[]) {
    await this.ensureReady();
    await Promise.all(mids.map(async(mid) => {
      const message = this.appMessagesManager.getMessageByPeer(peerId, mid);
      if(!message) return;
      await this.captureDeletedMessage(message, 'manual_keep');
    }));
    this.markSkipKeys(peerId, mids);
  }

  public async handleMessageDeleted(message: Message.message | Message.messageService, reason: AyuMomentReason = 'server_delete') {
    if(!message || !message.peerId) return;
    if(!this.shouldCaptureDeletion(message.peerId)) return;

    const key = this.getMessageKey(message.peerId, message.mid);
    if(this.shouldSkipKey(key)) return;

    await this.captureDeletedMessage(message, reason);
  }

  private async captureDeletedMessage(message: Message.message | Message.messageService, reason: AyuMomentReason) {
    await this.ensureReady();

    const storedMessage = this.sanitizeMessage(message);

    if(this.settingsCache && !this.settingsCache.saveReactions) {
      delete (storedMessage as Message.message).reactions;
      delete (storedMessage as Message.messageService).reactions;
    }

    const snapshot: AyuDeletedMoment = {
      id: this.generateId('deleted'),
      type: 'deleted',
      peerId: message.peerId,
      messageId: message.mid,
      threadId: this.getThreadIdFromMessage(message),
      timestamp: tsNow(true),
      reason,
      message: storedMessage
    };

    await this.persistSnapshot(snapshot);
  }

  public async handleMessageEdited(oldMessage: Message.message | Message.messageService, newMessage?: Message.message | Message.messageService) {
    if(!oldMessage || oldMessage._ !== 'message' || !oldMessage.peerId) return;
    if(!this.shouldCaptureEdit(oldMessage.peerId)) return;

    await this.ensureReady();
    const key = this.getMessageKey(oldMessage.peerId, oldMessage.mid);
    const history = this.editsByKey.get(key);
    const revisionNumber = (history?.revisions.length ?? 0) + 1;

    const snapshot: AyuEditRevision = {
      id: this.generateId('edited'),
      type: 'edited',
      peerId: oldMessage.peerId,
      messageId: oldMessage.mid,
      threadId: this.getThreadIdFromMessage(oldMessage),
      timestamp: tsNow(true),
      reason: 'edit',
      revision: revisionNumber,
      message: this.sanitizeMessage(oldMessage as Message.message),
      newMessage: newMessage ? this.sanitizeMessage(newMessage as Message.message) : undefined
    };

    await this.persistSnapshot(snapshot);
  }

  private getThreadIdFromMessage(message: Message.message | Message.messageService) {
    if(message._ !== 'message') return undefined;
    const reply = message.reply_to;
    if(reply?._ === 'messageReplyHeader') {
      return reply.reply_to_top_id;
    }

    return undefined;
  }

  private generateId(type: AyuMomentType) {
    return `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${this.getAccountNumber()}`;
  }

  private async persistSnapshot(snapshot: AyuMomentsStorageValue) {
    this.entries.set(snapshot.id, snapshot);
    this.insertOrder(snapshot);
    await this.storage.set({[snapshot.id]: snapshot});

    if(snapshot.type === 'deleted') {
      this.deletedByKey.set(this.getMessageKey(snapshot.peerId, snapshot.messageId), snapshot);
      this.dispatchAdd(copy(snapshot));
    } else {
      this.insertRevision(snapshot);
    }

    this.enforceLimit();
  }

  private insertRevision(revision: AyuEditRevision) {
    const key = this.getMessageKey(revision.peerId, revision.messageId);
    let history = this.editsByKey.get(key);
    if(!history) {
      history = {
        key,
        peerId: revision.peerId,
        messageId: revision.messageId,
        lastUpdatedAt: revision.timestamp,
        revisions: []
      };
      this.editsByKey.set(key, history);
    }

    history.revisions.push(revision);
    history.revisions.sort((a, b) => b.timestamp - a.timestamp);
    history.lastUpdatedAt = Math.max(history.lastUpdatedAt, revision.timestamp);
    this.dispatchHistoryReplace(copy(history));
  }

  private dispatchAdd(snapshot: AyuMomentsStorageValue) {
    this.rootScope.dispatchEvent('ayu_moments_update', {action: 'add', snapshot});
  }

  private dispatchHistoryReplace(history: AyuEditHistory) {
    this.rootScope.dispatchEvent('ayu_moments_update', {action: 'replace-history', history});
  }

  private dispatchRemove(id: string) {
    this.rootScope.dispatchEvent('ayu_moments_update', {action: 'remove', id});
  }

  private removeSnapshot(id: string, silent = false) {
    const snapshot = this.entries.get(id);
    if(!snapshot) return;

    this.entries.delete(id);
    this.storage.delete(id);
    this.removeFromOrder(id);

    if(snapshot.type === 'deleted') {
      this.deletedByKey.delete(this.getMessageKey(snapshot.peerId, snapshot.messageId));
    } else {
      const key = this.getMessageKey(snapshot.peerId, snapshot.messageId);
      const history = this.editsByKey.get(key);
      if(history) {
        history.revisions = history.revisions.filter((rev) => rev.id !== id);
        if(!history.revisions.length) {
          this.editsByKey.delete(key);
        } else {
          history.lastUpdatedAt = history.revisions[0].timestamp;
          if(!silent) this.dispatchHistoryReplace(copy(history));
        }
      }
    }

    if(!silent) this.dispatchRemove(id);
  }

  public async deleteMoment(id: string) {
    await this.ensureReady();
    this.removeSnapshot(id);
  }

  public async clearMoments(type?: AyuMomentType) {
    await this.ensureReady();

    if(!type) {
      this.entries.clear();
      this.order = [];
      this.deletedByKey.clear();
      this.editsByKey.clear();
      await this.storage.clear();
      this.rootScope.dispatchEvent('ayu_moments_update', {action: 'reset'});
      return;
    }

    const ids = Array.from(this.entries.values())
      .filter((entry) => entry.type === type)
      .map((entry) => entry.id);

    ids.forEach((id) => this.removeSnapshot(id));
  }

  public async getDeletedMoments() {
    await this.ensureReady();
    return Array.from(this.deletedByKey.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .map((entry) => copy(entry));
  }

  public async getEditHistories() {
    await this.ensureReady();
    return Array.from(this.editsByKey.values())
      .sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt)
      .map((history) => copy(history));
  }

  public async getSnapshot() {
    return {
      deleted: await this.getDeletedMoments(),
      edits: await this.getEditHistories()
    };
  }

  public async hasEditHistory(peerId: PeerId, mid: number) {
    await this.ensureReady();
    return this.editsByKey.has(this.getMessageKey(peerId, mid));
  }

  public async getEditHistory(peerId: PeerId, mid: number) {
    await this.ensureReady();
    const history = this.editsByKey.get(this.getMessageKey(peerId, mid));
    return history ? copy(history) : undefined;
  }

  public async getPeerSnapshot(peerId: PeerId) {
    await this.ensureReady();
    const deleted = Array.from(this.deletedByKey.values())
      .filter((entry) => entry.peerId === peerId)
      .map((entry) => copy(entry));
    const edits = Array.from(this.editsByKey.values())
      .filter((entry) => entry.peerId === peerId)
      .map((entry) => copy(entry));
    return {deleted, edits};
  }

  public async hasDeletedMomentsForPeer(peerId: PeerId) {
    await this.ensureReady();
    return Array.from(this.deletedByKey.values()).some((entry) => entry.peerId === peerId);
  }

  public async hasEditedMomentsForPeer(peerId: PeerId) {
    await this.ensureReady();
    return Array.from(this.editsByKey.values()).some((entry) => entry.peerId === peerId);
  }

}

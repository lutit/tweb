/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {AppStickersManager} from '../../lib/appManagers/appStickersManager';
import type ChatInput from '../chat/input';
import PopupElement from '.';
import wrapSticker from '../wrappers/sticker';
import LazyLoadQueue from '../lazyLoadQueue';
import {putPreloader} from '../putPreloader';
import animationIntersector, {AnimationItemGroup} from '../animationIntersector';
import appImManager from '../../lib/appManagers/appImManager';
import mediaSizes from '../../helpers/mediaSizes';
import {i18n, LangPackKey} from '../../lib/langPack';
import Button from '../button';
import findUpClassName from '../../helpers/dom/findUpClassName';
import toggleDisability from '../../helpers/dom/toggleDisability';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import {toastNew} from '../toast';
import setInnerHTML from '../../helpers/dom/setInnerHTML';
import createStickersContextMenu from '../../helpers/dom/createStickersContextMenu';
import attachStickerViewerListeners from '../stickerViewer';
import {Document, StickerSet} from '../../layer';
import Row from '../row';
import replaceContent from '../../helpers/dom/replaceContent';
import rootScope from '../../lib/rootScope';
import wrapCustomEmoji from '../wrappers/customEmoji';
import emoticonsDropdown from '../emoticonsDropdown';
import ButtonMenuToggle from '../buttonMenuToggle';
import {copyTextToClipboard} from '../../helpers/clipboard';
import wrapRichText from '../../lib/richTextProcessor/wrapRichText';
import {onMediaCaptionClick} from '../appMediaViewer';
import ButtonMenu, {ButtonMenuItemOptionsVerifiable} from '../buttonMenu';
import appDownloadManager from '../../lib/appManagers/appDownloadManager';
import pause from '../../helpers/schedulers/pause';
import toArray from '../../helpers/array/toArray';
import createSubmenuTrigger from '../createSubmenuTrigger';
import {crc32} from '../../vendor/simple-yenc';
import {IS_FIREFOX} from '../../environment/userAgent';

const ANIMATION_GROUP: AnimationItemGroup = 'STICKERS-POPUP';

export default class PopupStickers extends PopupElement {
  private appendTo: HTMLElement;
  private updateAdded: {[setId: Long]: (added: boolean) => void};
  private sets: StickerSet.stickerSet[];
  private button: HTMLElement;

  constructor(
    private stickerSetInput: Parameters<AppStickersManager['getStickerSet']>[0] | Parameters<AppStickersManager['getStickerSet']>[0][],
    private isEmojis?: boolean,
    private chatInput: ChatInput = appImManager.chat?.input
  ) {
    super('popup-stickers', {
      closable: true,
      overlayClosable: true,
      body: true,
      scrollable: true,
      title: true,
      footer: true
    });

    this.title.append(i18n('Loading'));
    this.updateAdded = {};

    emoticonsDropdown.setIgnoreMouseOut('popup', true);
    this.addEventListener('close', () => {
      emoticonsDropdown.setIgnoreMouseOut('popup', false);
      animationIntersector.setOnlyOnePlayableGroup();
    });

    this.appendTo = this.scrollable.container;

    this.appendTo.classList.add('is-loading');
    putPreloader(this.appendTo, true);

    const btn = Button('btn-primary btn-primary-transparent disable-hover', {noRipple: true, text: 'Loading'});
    this.footer.append(btn);

    attachStickerViewerListeners({listenTo: this.appendTo, listenerSetter: this.listenerSetter});

    const onStickerSetUpdate = (set: StickerSet.stickerSet) => {
      const idx = this.sets.findIndex((_set) => _set.id === set.id);
      if(idx === -1) {
        return;
      }

      this.sets[idx] = set;
      const updateAdded = this.updateAdded[set.id];
      updateAdded?.(!!set.installed_date);
      this.updateButton();
    };

    this.listenerSetter.add(rootScope)('stickers_installed', onStickerSetUpdate);
    this.listenerSetter.add(rootScope)('stickers_deleted', onStickerSetUpdate);

    const onClick = (e: MouseEvent) => {
      const callback = onMediaCaptionClick(this.container, e);
      if(callback) {
        this.addEventListener('closeAfterTimeout', callback);
        this.hide();
        return false;
      }
    };

    this.container.addEventListener('click', onClick, {capture: true});
    this.middlewareHelper.onDestroy(() => {
      this.container.removeEventListener('click', onClick, {capture: true});
    });

    this.loadStickerSet();
  }

  private createDetailsDisplay(labelKey: LangPackKey, value: string | HTMLElement) {
    const container = document.createElement('span');
    container.classList.add('btn-menu-item-with-auxiliary-text');

    const labelElement = i18n(labelKey);
    labelElement.classList.add('btn-menu-item-label');
    container.append(labelElement);

    const valueElement = document.createElement('span');
    valueElement.classList.add('btn-menu-item-auxiliary-text');
    if(typeof value === 'string') {
      valueElement.textContent = value;
    } else {
      valueElement.append(value);
    }

    container.append(valueElement);
    return container;
  }

  private createStickerSetElements(set?: StickerSet.stickerSet) {
    const container = document.createElement('div');
    container.classList.add('sticker-set');

    let headerRow: Row, updateAdded: (added: boolean) => void;
    if(set) {
      headerRow = new Row({
        title: wrapRichText(set.title),
        subtitle: i18n(set.pFlags.emojis ? 'EmojiCount' : 'Stickers', [set.count]),
        buttonRight: true
      });

      updateAdded = (added) => {
        replaceContent(headerRow.buttonRight, i18n(added ? 'Stickers.SearchAdded' : 'Stickers.SearchAdd'));
        headerRow.buttonRight.classList.toggle('active', added);
      };

      updateAdded(!!set.installed_date);

      container.append(headerRow.container);
    }

    const itemsContainer = document.createElement('div');
    itemsContainer.classList.add('sticker-set-stickers');

    container.append(itemsContainer);

    return {container, headerRow, updateAdded, itemsContainer};
  }

  private onStickersClick = async(e: MouseEvent) => {
    if(!this.chatInput.chat.peerId) {
      return;
    }

    const target = findUpClassName(e.target, 'sticker-set-sticker') || findUpClassName(e.target, 'custom-emoji');
    if(!target) return;

    const docId = target.dataset.docId;
    let emoji: {docId: DocId, emoji: string}
    if(this.isEmojis) {
      emoji = {docId, emoji: target.dataset.stickerEmoji};
      if(!this.chatInput.emoticonsDropdown.canUseEmoji(emoji, true)) {
        return;
      }
    }

    const shouldHide = this.isEmojis ?
      this.chatInput.onEmojiSelected(emoji, false) :
      await appImManager.chat.input.sendMessageWithDocument({document: docId, target});
    if(shouldHide) {
      this.hide();
    }
  };

  private async loadStickerSet() {
    const middleware = this.middlewareHelper.get();
    const inputs = toArray(this.stickerSetInput);
    const setsPromises = inputs.map((input) => this.managers.appStickersManager.getStickerSet(input));
    let sets = await Promise.all(setsPromises);
    if(!middleware()) return;
    let firstSet = sets[0];
    if(sets.length === 1 && !firstSet) {
      toastNew({langPackKey: this.isEmojis ? 'AddEmojiNotFound' : 'StickerSet.DontExist'});
      this.hide();
      return;
    }

    sets = sets.filter(Boolean);
    firstSet = sets[0];

    this.sets = sets.map((set) => set.set);

    const isEmojis = this.isEmojis ??= !!firstSet.set.pFlags.emojis;

    attachClickEvent(this.appendTo, this.onStickersClick, {listenerSetter: this.listenerSetter});

    const {destroy} = createStickersContextMenu({
      listenTo: this.appendTo,
      chatInput: this.chatInput,
      isPack: true,
      isEmojis: isEmojis,
      onSend: () => this.hide()
    });

    this.addEventListener('close', destroy);

    animationIntersector.setOnlyOnePlayableGroup(ANIMATION_GROUP);

    const lazyLoadQueue = new LazyLoadQueue();
    const loadPromises: Promise<any>[] = [];

    const containersPromises = sets.map(async(set) => {
      const {container, itemsContainer, headerRow, updateAdded} = this.createStickerSetElements(sets.length > 1 ? set.set : undefined);

      if(headerRow) {
        attachClickEvent(headerRow.buttonRight, () => {
          this.managers.appStickersManager.toggleStickerSet(set.set);
        }, {listenerSetter: this.listenerSetter});
      }

      this.updateAdded[set.set.id] = updateAdded;

      let divs: (HTMLElement | DocumentFragment)[];

      const docs = set.documents.filter((doc) => doc?._ === 'document') as Document.document[];
      if(isEmojis) {
        const fragment = wrapCustomEmoji({
          docIds: docs.map((doc) => doc.id),
          loadPromises,
          animationGroup: ANIMATION_GROUP,
          customEmojiSize: mediaSizes.active.esgCustomEmoji,
          middleware
          // lazyLoadQueue
        });

        (Array.from(fragment.children) as HTMLElement[]).slice(1).forEach((element) => {
          const span = document.createElement('span');
          span.classList.add('super-emoji', 'super-emoji-custom');
          element.replaceWith(span);
          span.append(element);
        });

        divs = [fragment];

        itemsContainer.classList.replace('sticker-set-stickers', 'super-emojis');
        itemsContainer.classList.add('is-emojis');
      } else {
        divs = await Promise.all(docs.map(async(doc) => {
          const div = document.createElement('div');
          div.classList.add('sticker-set-sticker');

          const size = mediaSizes.active.popupSticker.width;

          await wrapSticker({
            doc,
            div,
            lazyLoadQueue,
            group: ANIMATION_GROUP,
            play: true,
            loop: true,
            width: size,
            height: size,
            withLock: true,
            loadPromises,
            middleware
          });

          return div;
        }));
      }

      itemsContainer.append(...divs.filter(Boolean));

      return container;
    });

    const containers = await Promise.all(containersPromises);
    await Promise.all(loadPromises);

    const button = this.button = Button('', {noRipple: true});

    this.updateButton();

    attachClickEvent(button, () => {
      const toggle = toggleDisability([button], true);

      this.managers.appStickersManager.toggleStickerSets(sets.map((set) => set.set)).then(() => {
        this.hide();
      }).catch(() => {
        toggle();
      });
    }, {listenerSetter: this.listenerSetter});

    if(sets.length === 1) {
      setInnerHTML(this.title, wrapRichText(firstSet.set.title));
    } else {
      setInnerHTML(this.title, i18n('Emoji'));
    }

    const buttons: ButtonMenuItemOptionsVerifiable[] = [{
      icon: 'copy',
      text: 'CopyLink',
      onClick: () => {
        const prefix = `https://t.me/${this.isEmojis ? 'addemoji' : 'addstickers'}/`;
        const text = sets.map((set) => prefix + set.set.short_name).join('\n');
        copyTextToClipboard(text);
      }
    }, createSubmenuTrigger({
      icon: 'info',
      text: 'Message.Context.Details',
      separatorDown: true
    }, async({middleware}) => {
      const first = this.sets?.[0];
      if(!first) return;

      const items: ButtonMenuItemOptionsVerifiable[] = [];
      const pushRow = (labelKey: LangPackKey, value: string) => {
        items.push({
          regularText: this.createDetailsDisplay(labelKey, value),
          onClick: () => copyTextToClipboard(value)
        });
      };

      pushRow('StickerSet.Details.Id', String(first.id));
      pushRow('StickerSet.Details.AccessHash', String(first.access_hash));

      if(first.short_name) {
        const username = '@' + first.short_name;
        pushRow('StickerSet.Details.ShortName', username);
      }

      pushRow('StickerSet.Details.Title', first.title);
      pushRow('StickerSet.Details.Count', String(first.count));

      const flags: string[] = [];
      if(first.pFlags?.official) flags.push('official');
      if(first.pFlags?.archived) flags.push('archived');
      if(first.pFlags?.masks) flags.push('masks');
      if(first.pFlags?.emojis) flags.push('emoji');
      if(first.pFlags?.creator) flags.push('creator');
      if(flags.length) {
        pushRow('StickerSet.Details.Flags', flags.join(', '));
      }

      if(!middleware()) return;

      return ButtonMenu({
        buttons: items
      });
    })];

    buttons.push({
      icon: 'download',
      text: 'MediaViewer.Context.Download',
      onClick: async() => {
        toastNew({
          langPackKey: 'StickerSet.Toast.PreparingArchive',
          durationMs: 8000
        });
        await pause(0);

        console.log('[PopupStickers] download: start');

        const entries: {name: string, data: Uint8Array}[] = [];

        try {
          for(const set of sets) {
            const baseName = set.set.short_name || set.set.title || String(set.set.id);
            let index = 0;

            for(const doc of set.documents) {
              const blob = await appDownloadManager.downloadMedia({
                media: doc as Document.document
              }) as unknown as Blob;

              if(!blob) {
                console.warn('[PopupStickers] download: blob is empty, skipping document', doc);
                continue;
              }

              const buffer = await blob.arrayBuffer();
              const data = new Uint8Array(buffer);

              const mime = (doc as Document.document).mime_type || 'application/octet-stream';
              let ext = 'bin';
              if(mime === 'image/webp') ext = 'webp';
              else if(mime === 'image/jpeg') ext = 'jpg';
              else if(mime === 'image/png') ext = 'png';
              else if(mime === 'video/mp4') ext = 'mp4';
              else if(mime === 'video/webm') ext = 'webm';
              else if(mime === 'application/x-tgsticker') ext = 'tgs';

              const name = `${baseName}_${(++index).toString().padStart(3, '0')}.${ext}`;
              entries.push({name, data});
            }
          }
        } catch(err) {
          console.error('[PopupStickers] download: error while collecting entries', err);
          return;
        }

        if(!entries.length) {
          console.warn('[PopupStickers] download: no entries to archive');
          return;
        }

        console.log('[PopupStickers] download: creating zip from entries', entries.length);
        let zipBlob: Blob;
        try {
          zipBlob = this.createZipFromEntries(entries);
        } catch(err) {
          console.error('[PopupStickers] download: error while creating zip', err);
          return;
        }

        console.log('[PopupStickers] download: zip created', {size: zipBlob.size});

        const firstSet = sets[0];
        const zipBaseName =
          (firstSet && (firstSet.set.short_name || firstSet.set.title)) ||
          (this.isEmojis ? 'emoji' : 'stickers');
        const zipName = `${zipBaseName}.zip`;

        try {
          const url = URL.createObjectURL(zipBlob);
          console.log('[PopupStickers] download: object URL created', url);

          if(IS_FIREFOX) {
            console.log('[PopupStickers] download: using Firefox fallback via window.open');
            window.open(url, '_blank');
          } else {
            const a = document.createElement('a');
            a.href = url;
            a.download = zipName;
            document.body.append(a);
            a.click();
            console.log('[PopupStickers] download: click dispatched');
            a.remove();
          }

          URL.revokeObjectURL(url);
          console.log('[PopupStickers] download: URL revoked');
        } catch(err) {
          console.error('[PopupStickers] download: error while triggering download', err);
        }
      }
    });

    const btnMenu = ButtonMenuToggle({
      listenerSetter: this.listenerSetter,
      buttons,
      direction: 'bottom-left'
    });
    this.title.after(btnMenu);

    this.footer.textContent = '';
    this.footer.append(button);

    this.appendTo.classList.remove('is-loading');
    this.appendTo.textContent = '';
    this.appendTo.append(...containers);

    this.scrollable.onAdditionalScroll();
  }

  private updateButton() {
    const {sets, isEmojis} = this;
    let isAdd: boolean, buttonAppend: HTMLElement;
    if(sets.length === 1) {
      const firstSet = sets[0];
      buttonAppend = i18n(isEmojis ? 'EmojiCount' : 'Stickers', [firstSet.count]);
      isAdd = !firstSet.installed_date;
    } else {
      const installed = sets.filter((set) => set.installed_date);
      let count: number;
      if(sets.length === installed.length) {
        isAdd = false;
        count = sets.length;
      } else {
        isAdd = true;
        count = sets.length - installed.length;
      }

      buttonAppend = i18n('EmojiPackCount', [count]);
    }

    this.button.className = isAdd ? 'btn-primary btn-color-primary' : 'btn-primary btn-primary-transparent danger';
    replaceContent(this.button, i18n(isAdd ? 'AddStickersCount' : 'RemoveStickersCount', [buttonAppend]));
  }

  private createZipFromEntries(entries: {name: string, data: Uint8Array}[]): Blob {
    const encoder = new TextEncoder();

    const localParts: Uint8Array[] = [];
    const centralParts: Uint8Array[] = [];

    let localOffset = 0;

    for(const entry of entries) {
      const nameBytes = encoder.encode(entry.name);
      const data = entry.data;
      const crc = crc32(data) >>> 0;
      const compressedSize = data.length;
      const uncompressedSize = data.length;
      const modTime = 0;
      const modDate = 0;

      const localHeaderView = new DataView(new ArrayBuffer(30));
      let o = 0;
      localHeaderView.setUint32(o, 0x04034b50, true); o += 4; // signature
      localHeaderView.setUint16(o, 20, true); o += 2; // version needed
      localHeaderView.setUint16(o, 0, true); o += 2; // flags
      localHeaderView.setUint16(o, 0, true); o += 2; // compression method (store)
      localHeaderView.setUint16(o, modTime, true); o += 2;
      localHeaderView.setUint16(o, modDate, true); o += 2;
      localHeaderView.setUint32(o, crc, true); o += 4;
      localHeaderView.setUint32(o, compressedSize, true); o += 4;
      localHeaderView.setUint32(o, uncompressedSize, true); o += 4;
      localHeaderView.setUint16(o, nameBytes.length, true); o += 2;
      localHeaderView.setUint16(o, 0, true); o += 2; // extra length

      const localHeader = new Uint8Array(localHeaderView.buffer);
      localParts.push(localHeader, nameBytes, data);

      const centralHeaderView = new DataView(new ArrayBuffer(46));
      o = 0;
      centralHeaderView.setUint32(o, 0x02014b50, true); o += 4; // signature
      centralHeaderView.setUint16(o, 20, true); o += 2; // version made by
      centralHeaderView.setUint16(o, 20, true); o += 2; // version needed
      centralHeaderView.setUint16(o, 0, true); o += 2; // flags
      centralHeaderView.setUint16(o, 0, true); o += 2; // compression method
      centralHeaderView.setUint16(o, modTime, true); o += 2;
      centralHeaderView.setUint16(o, modDate, true); o += 2;
      centralHeaderView.setUint32(o, crc, true); o += 4;
      centralHeaderView.setUint32(o, compressedSize, true); o += 4;
      centralHeaderView.setUint32(o, uncompressedSize, true); o += 4;
      centralHeaderView.setUint16(o, nameBytes.length, true); o += 2;
      centralHeaderView.setUint16(o, 0, true); o += 2; // extra
      centralHeaderView.setUint16(o, 0, true); o += 2; // comment
      centralHeaderView.setUint16(o, 0, true); o += 2; // disk number
      centralHeaderView.setUint16(o, 0, true); o += 2; // internal attrs
      centralHeaderView.setUint32(o, 0, true); o += 4; // external attrs
      centralHeaderView.setUint32(o, localOffset, true); o += 4; // local header offset

      const centralHeader = new Uint8Array(centralHeaderView.buffer);
      centralParts.push(centralHeader, nameBytes);

      localOffset += localHeader.length + nameBytes.length + data.length;
    }

    const localSize = localParts.reduce((sum, part) => sum + part.length, 0);
    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const endRecordSize = 22;
    const totalSize = localSize + centralSize + endRecordSize;

    const out = new Uint8Array(totalSize);
    let offset = 0;

    for(const part of localParts) {
      out.set(part, offset);
      offset += part.length;
    }

    for(const part of centralParts) {
      out.set(part, offset);
      offset += part.length;
    }

    const endView = new DataView(out.buffer, offset, endRecordSize);
    let o2 = 0;
    endView.setUint32(o2, 0x06054b50, true); o2 += 4; // signature
    endView.setUint16(o2, 0, true); o2 += 2; // disk number
    endView.setUint16(o2, 0, true); o2 += 2; // start disk
    endView.setUint16(o2, entries.length, true); o2 += 2; // entries on this disk
    endView.setUint16(o2, entries.length, true); o2 += 2; // total entries
    endView.setUint32(o2, centralSize, true); o2 += 4; // central dir size
    endView.setUint32(o2, localSize, true); o2 += 4; // central dir offset
    endView.setUint16(o2, 0, true); // comment length

    return new Blob([out], {type: 'application/zip'});
  }
}

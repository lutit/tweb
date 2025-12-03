import {toastNew} from '../toast';
import {i18n} from '../../lib/langPack';
import type {AppManagers} from '../../lib/appManagers/managers';
import type {MyMessage} from '../../lib/appManagers/appMessagesManager';
import PopupPickUser from '../popups/pickUser';

export function forwardVirtualMessages(options: {
  managers: AppManagers,
  messages: MyMessage[],
  onComplete?: () => void
}) {
  const chunks = options.messages.map((message) => getVirtualForwardText(message)).filter(Boolean);
  if(!chunks.length) {
    toastNew({langPackKey: 'ClientSettings.AyuMoments.Toast.NoText'});
    return;
  }

  const payload = chunks.join('\n\n');
  PopupPickUser.createSharingPicker({
    placeholder: 'ShareModal.Search.ForwardPlaceholder',
    onSelect: async(peerId, threadId, monoforumThreadId) => {
      await options.managers.appMessagesManager.sendText({
        peerId,
        threadId,
        monoforumThreadId,
        text: payload
      });
      options.onComplete?.();
    }
  });
}

function getVirtualForwardText(message: MyMessage | undefined) {
  if(!message) return '';
  if(message._ === 'message') {
    const text = message.message?.trim();
    if(text) {
      return text;
    }
  }

  return i18n('ClientSettings.AyuMoments.Attachment').textContent || '[Attachment]';
}

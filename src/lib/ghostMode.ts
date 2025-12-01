import type {StateSettings} from '../config/state';
import rootScope from './rootScope';

type GhostModeSettings = NonNullable<StateSettings['client']>['ghostMode'];

function getGhostSettings(): GhostModeSettings | undefined {
  const settings = rootScope.settings as StateSettings | undefined;
  return settings?.client?.ghostMode;
}

export function isGhostDontReadMessagesEnabled(): boolean {
  return !!getGhostSettings()?.dontReadMessages;
}

export function isGhostDontReadStoriesEnabled(): boolean {
  return !!getGhostSettings()?.dontReadStories;
}

export function isGhostDontSendOnlineEnabled(): boolean {
  return !!getGhostSettings()?.dontSendOnline;
}

export function isGhostDontSendTypingEnabled(): boolean {
  return !!getGhostSettings()?.dontSendTyping;
}

export function isGhostGoOfflineAutomaticallyEnabled(): boolean {
  return !!getGhostSettings()?.goOfflineAutomatically;
}

export function isGhostScheduleMessagesEnabled(): boolean {
  return !!getGhostSettings()?.scheduleMessages;
}

export function isGhostSendWithoutSoundEnabled(): boolean {
  return !!getGhostSettings()?.sendWithoutSound;
}

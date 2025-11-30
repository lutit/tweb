import type {StateSettings} from '../config/state';
import rootScope from './rootScope';

type ClientSettings = NonNullable<StateSettings['client']>;

function getClientSettings(): ClientSettings | undefined {
  const settings = rootScope.settings as StateSettings | undefined;
  return settings?.client;
}

export function isForceCopyEnabled(): boolean {
  return !!getClientSettings()?.forceCopy;
}


import type {StateSettings} from '../../config/state';
import rootScope from '../rootScope';

export type AyuMomentsSettings = NonNullable<NonNullable<StateSettings['client']>['ayuMoments']>;

export function getAyuMomentsSettings(settings: StateSettings = rootScope.settings as StateSettings) {
  return settings?.client?.ayuMoments;
}

export function isAyuMomentsEnabled(settings?: StateSettings) {
  const ayu = getAyuMomentsSettings(settings);
  return !!(ayu && (ayu.saveDeleted || ayu.saveEdited));
}

export function shouldShowKeepLocallyPrompt(settings?: StateSettings) {
  const ayu = getAyuMomentsSettings(settings);
  return !!(ayu && ayu.saveDeleted && ayu.keepLocallyPrompt);
}

export function isKeepLocallyDefaultOn(settings?: StateSettings) {
  const ayu = getAyuMomentsSettings(settings);
  return !!ayu?.keepLocallyDefaultOn;
}

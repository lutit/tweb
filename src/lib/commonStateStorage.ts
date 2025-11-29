import {LangPackDifference} from '../layer';
import {CommonDatabase, getCommonDatabaseState} from '../config/databases/state';
import {MOUNT_CLASS_TO} from '../config/debug';
import {COMMON_STATE_INIT, StateSettings} from '../config/state';
import copy from '../helpers/object/copy';

import AppStorage from './storage';
import {ActiveAccountNumber} from './accounts/types';
import DeferredIsUsingPasscode from './passcode/deferredIsUsingPasscode';

export type PasscodeStorageValue = {
  /**
   * Have different random hash salt per user to prevent precomputed attacks
   *
   * Used to randomize the verification hash
   */
  verificationSalt: Uint8Array;
  /**
   * Hash used just to verify whether the passcode is correct, the hash for encryption will not be stored anywhere except in memory
   */
  verificationHash: Uint8Array;
  /**
   * Salt used for getting a cryptographic key derived from passcode that will be used for encryption (instead of passing raw passcode between processes)
   *
   * Used to randomize the encryption per user
   */
  encryptionSalt: Uint8Array;
};

type AppStorageValue = {
  langPack: LangPackDifference;
  settings: StateSettings;
  notificationsCount: Partial<Record<ActiveAccountNumber, number>>;
  passcode: PasscodeStorageValue;
};

class CommonStateStorage extends AppStorage<AppStorageValue, CommonDatabase> {
  constructor() {
    super(getCommonDatabaseState(), 'session');
  }
}

const commonStateStorage = new CommonStateStorage();

commonStateStorage.get('settings', false).then((settings) => {
  DeferredIsUsingPasscode.resolveDeferred(settings?.passcode?.enabled || false);
});

export async function resetSettingsToDefault(preservePasscode = true) {
  try {
    const current = await commonStateStorage.get('settings', false);
    const settings: StateSettings = copy(COMMON_STATE_INIT.settings);

    if(preservePasscode && current?.passcode) {
      settings.passcode = current.passcode;
    }

    await commonStateStorage.set({settings});
  } catch(err) {
    console.error('resetSettingsToDefault error', err);
  }
}

MOUNT_CLASS_TO.commonStateStorage = commonStateStorage;
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.resetSettingsToDefault = resetSettingsToDefault);
export default commonStateStorage;

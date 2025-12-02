import {SliderSuperTabEventable} from '../../sliderTab';
import {generateSection} from '../../settingSection';
import Row from '../../row';
import {replaceButtonIcon} from '../../button';
import Icon from '../../icon';
import appImManager from '../../../lib/appManagers/appImManager';
import safeWindowOpen from '../../../helpers/dom/safeWindowOpen';
import AppClientSessionSpoofTab from './clientSessionSpoof';
import AppClientSettingsPrivacyTab from './clientSettingsPrivacy';
import AppClientSettingsChatsTab from './clientSettingsChats';
import AppClientSettingsProfileTab from './clientSettingsProfile';
import AppClientSettingsPremiumTab from './clientSettingsPremium';

export default class AppClientSettingsTab extends SliderSuperTabEventable {
  public init() {
    this.container.classList.add('general-settings-container');
    this.setTitle('ClientSettings.MenuTitle');

    const isInSettingsPopup = !!this.container.closest('.settings-slider-popup__height-limit');
    if(isInSettingsPopup) {
      replaceButtonIcon(this.closeBtn as HTMLElement, 'close');
    }

    const section = generateSection.bind(null, this.scrollable);

    const categoriesContainer = section('ClientSettings.Categories');

    const categories: {icon: Icon, titleLangKey: Parameters<typeof Row>[0]['titleLangKey'], ctor: any}[] = [
      {icon: 'lock', titleLangKey: 'ClientSettings.Category.Privacy', ctor: AppClientSettingsPrivacyTab},
      {icon: 'dialogs', titleLangKey: 'ClientSettings.Category.Chats', ctor: AppClientSettingsChatsTab},
      {icon: 'user', titleLangKey: 'ClientSettings.Category.Profile', ctor: AppClientSettingsProfileTab},
      {icon: 'star', titleLangKey: 'ClientSettings.Category.Premium', ctor: AppClientSettingsPremiumTab}
    ];

    categories.forEach(({icon, titleLangKey, ctor}) => {
      const row = new Row({
        icon,
        titleLangKey,
        navigationTab: {
          constructor: ctor,
          slider: this.slider
        },
        listenerSetter: this.listenerSetter
      });

      categoriesContainer.append(row.container);
    });

    // Category-specific settings are moved to nested tabs.

    {
      const container = section('ClientSettings.Experimental');

      const row = new Row({
        icon: 'settings',
        titleLangKey: 'ClientSettings.Spoof',
        subtitleLangKey: 'ClientSettings.Spoof.SectionTitle',
        navigationTab: {
          constructor: AppClientSessionSpoofTab,
          slider: this.slider
        },
        listenerSetter: this.listenerSetter
      });

      container.append(row.container);
    }

    // Important: do NOT add anything below the "ClientSettings.Other" section it must always be the last one.
    {
      const container = section('ClientSettings.Other');

      const tgChannelRow = new Row({
        icon: 'channel',
        titleLangKey: 'ClientSettings.Other.OpenTgc.Title',
        subtitleLangKey: 'ClientSettings.Other.OpenTgc.Subtitle',
        clickable: () => {
          appImManager.openUsername({userName: 'durov'});
        },
        listenerSetter: this.listenerSetter
      });

      const sourceCodeRow = new Row({
        icon: 'github',
        titleLangKey: 'ClientSettings.Other.SourceCode.Title',
        subtitleLangKey: 'ClientSettings.Other.SourceCode.Subtitle',
        clickable: () => {
          safeWindowOpen('https://github.com/lutit/tweb');
        },
        listenerSetter: this.listenerSetter
      });

      container.append(tgChannelRow.container, sourceCodeRow.container);
    }
  }
}

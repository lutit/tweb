import {SliderSuperTab} from '../../slider';
import SettingSection from '../../settingSection';
import Row from '../../row';
import CheckboxField from '../../checkboxField';
import {joinDeepPath} from '../../../helpers/object/setDeepProperty';

export default class AppClientSettingsPremiumTab extends SliderSuperTab {
  public init() {
    this.container.classList.add('general-settings-container');
    this.setTitle('ClientSettings.Category.Premium');

    {
      const container = new SettingSection({
        name: 'ClientSettings.Premium'
      });

      const localPremiumRow = new Row({
        titleLangKey: 'ClientSettings.Premium.LocalPremium',
        checkboxField: new CheckboxField({
          name: 'client-premium-local',
          stateKey: joinDeepPath('settings', 'client', 'premium', 'localPremium'),
          listenerSetter: this.listenerSetter,
          toggle: true
        }),
        listenerSetter: this.listenerSetter
      });

      const disableAdsRow = new Row({
        titleLangKey: 'ClientSettings.Premium.DisableAds',
        checkboxField: new CheckboxField({
          name: 'client-premium-disable-ads',
          stateKey: joinDeepPath('settings', 'client', 'premium', 'disableAds'),
          listenerSetter: this.listenerSetter,
          toggle: true
        }),
        listenerSetter: this.listenerSetter
      });

      container.content.append(localPremiumRow.container, disableAdsRow.container);

      this.scrollable.append(container.container);
    }

    {
      const container = new SettingSection({
        name: 'ClientSettings.AyuMoments'
      });

      const forceCopyRow = new Row({
        titleLangKey: 'ClientSettings.Premium.ForceCopy',
        checkboxField: new CheckboxField({
          name: 'client-premium-force-copy',
          stateKey: joinDeepPath('settings', 'client', 'forceCopy'),
          listenerSetter: this.listenerSetter,
          toggle: true
        }),
        listenerSetter: this.listenerSetter
      });

      container.content.append(forceCopyRow.container);

      this.scrollable.append(container.container);
    }
  }
}


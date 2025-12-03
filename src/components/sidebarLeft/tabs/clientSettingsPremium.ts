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

      const ayuMomentToggles = [
        {label: 'ClientSettings.AyuMoments.Enable', key: joinDeepPath('settings', 'client', 'ayuMoments', 'enabled'), name: 'client-ayu-enabled'},
        {label: 'ClientSettings.AyuMoments.SaveDeleted', key: joinDeepPath('settings', 'client', 'ayuMoments', 'saveDeleted'), name: 'client-ayu-save-deleted'},
        {label: 'ClientSettings.AyuMoments.SaveEdited', key: joinDeepPath('settings', 'client', 'ayuMoments', 'saveEdited'), name: 'client-ayu-save-edited'},
        {label: 'ClientSettings.AyuMoments.IncludeBots', key: joinDeepPath('settings', 'client', 'ayuMoments', 'includeBots'), name: 'client-ayu-include-bots'},
        {label: 'ClientSettings.AyuMoments.SaveReactions', key: joinDeepPath('settings', 'client', 'ayuMoments', 'saveReactions'), name: 'client-ayu-save-reactions'},
        {label: 'ClientSettings.AyuMoments.KeepPrompt', key: joinDeepPath('settings', 'client', 'ayuMoments', 'keepLocallyPrompt'), name: 'client-ayu-keep-prompt'},
        {label: 'ClientSettings.AyuMoments.KeepDefaultOn', key: joinDeepPath('settings', 'client', 'ayuMoments', 'keepLocallyDefaultOn'), name: 'client-ayu-keep-default'}
      ] as const;

      ayuMomentToggles.forEach(({label, key, name}) => {
        const row = new Row({
          titleLangKey: label,
          checkboxField: new CheckboxField({
            name,
            stateKey: key,
            toggle: true,
            listenerSetter: this.listenerSetter
          }),
          listenerSetter: this.listenerSetter
        });
        container.content.append(row.container);
      });

      this.scrollable.append(container.container);
    }
  }
}

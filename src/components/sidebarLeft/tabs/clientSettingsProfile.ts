import {SliderSuperTab} from '../../slider';
import SettingSection from '../../settingSection';
import Row from '../../row';
import CheckboxField from '../../checkboxField';
import RadioField from '../../radioField';
import {joinDeepPath} from '../../../helpers/object/setDeepProperty';

export default class AppClientSettingsProfileTab extends SliderSuperTab {
  public init() {
    this.container.classList.add('general-settings-container');
    this.setTitle('ClientSettings.Category.Profile');

    {
      const container = new SettingSection({
        name: 'ClientSettings.Profile'
      });

      const hidePhoneRow = new Row({
        titleLangKey: 'ClientSettings.Profile.HidePhone',
        checkboxField: new CheckboxField({
          name: 'client-profile-hide-phone',
          stateKey: joinDeepPath('settings', 'client', 'profile', 'hidePhoneNumberText'),
          listenerSetter: this.listenerSetter,
          toggle: true
        }),
        listenerSetter: this.listenerSetter
      });

      container.content.append(hidePhoneRow.container);

      this.scrollable.append(container.container);
    }

    {
      const container = new SettingSection({
        name: 'ClientSettings.Id'
      });

      const form = document.createElement('form');
      const name = 'client-profile-id-format';
      const stateKey = joinDeepPath('settings', 'client', 'profile', 'idFormat');

      const formats: Array<['hide' | 'botApi' | 'telegramApi', string]> = [
        ['hide', 'ClientSettings.Id.Format.Hide'],
        ['botApi', 'ClientSettings.Id.Format.BotApi'],
        ['telegramApi', 'ClientSettings.Id.Format.TelegramApi']
      ];

      const rows = formats.map(([value, langKey]) => {
        return new Row({
          radioField: new RadioField({
            langKey: langKey as any,
            name,
            value,
            stateKey
          }),
          listenerSetter: this.listenerSetter
        });
      });

      form.append(...rows.map((row) => row.container));
      container.content.append(form);

      this.scrollable.append(container.container);
    }
  }
}


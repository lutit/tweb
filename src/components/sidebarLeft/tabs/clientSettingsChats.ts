import {SliderSuperTab} from '../../slider';
import SettingSection from '../../settingSection';
import Row from '../../row';
import CheckboxField from '../../checkboxField';
import {joinDeepPath} from '../../../helpers/object/setDeepProperty';

export default class AppClientSettingsChatsTab extends SliderSuperTab {
  public init() {
    this.container.classList.add('general-settings-container');
    this.setTitle('ClientSettings.Category.Chats');

    {
      const container = new SettingSection({
        name: 'ClientSettings.Chats'
      });

      const row = new Row({
        titleLangKey: 'ClientSettings.Chats.ShowSecondsOnMessages',
        checkboxField: new CheckboxField({
          name: 'client-chats-show-seconds',
          stateKey: joinDeepPath('settings', 'client', 'chats', 'showSecondsOnMessages'),
          listenerSetter: this.listenerSetter,
          toggle: true
        }),
        listenerSetter: this.listenerSetter
      });

      const serviceTimeRow = new Row({
        titleLangKey: 'ClientSettings.Chats.ShowTimeOnServiceMessages',
        checkboxField: new CheckboxField({
          name: 'client-chats-show-service-time',
          stateKey: joinDeepPath('settings', 'client', 'chats', 'showTimeOnServiceMessages'),
          listenerSetter: this.listenerSetter,
          toggle: true
        }),
        listenerSetter: this.listenerSetter
      });

      const autoDeleteForEveryoneRow = new Row({
        titleLangKey: 'ClientSettings.Chats.AlwaysDeleteForEveryone',
        checkboxField: new CheckboxField({
          name: 'client-chats-always-delete-for-everyone',
          stateKey: joinDeepPath('settings', 'client', 'chats', 'alwaysDeleteForEveryone'),
          listenerSetter: this.listenerSetter,
          toggle: true
        }),
        listenerSetter: this.listenerSetter
      });

      container.content.append(row.container, serviceTimeRow.container, autoDeleteForEveryoneRow.container);

      this.scrollable.append(container.container);
    }

    {
      const container = new SettingSection({
        name: 'ClientSettings.ContextMenu'
      });

      const options = [
        {key: 'reactionsPanel', langKey: 'ClientSettings.ContextMenu.ReactionsPanel', icon: 'reactions'},
        {key: 'viewsPanel', langKey: 'ClientSettings.ContextMenu.ViewsPanel', icon: 'channelviews'},
        {key: 'details', langKey: 'ClientSettings.ContextMenu.Details', icon: 'info'},
        {key: 'repeatMessage', langKey: 'ClientSettings.ContextMenu.RepeatMessage', icon: 'rotate_right'}
      ] as const;

      options.forEach(({key, langKey, icon}) => {
        const row = new Row({
          icon,
          titleLangKey: langKey,
          checkboxField: new CheckboxField({
            name: `client-contextmenu-${key}`,
            stateKey: joinDeepPath('settings', 'client', 'contextMenu', key),
            listenerSetter: this.listenerSetter,
            toggle: true
          }),
          listenerSetter: this.listenerSetter
        });

        container.content.append(row.container);
      });

      this.scrollable.append(container.container);
    }
  }
}

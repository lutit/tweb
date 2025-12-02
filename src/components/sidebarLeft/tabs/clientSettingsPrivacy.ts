import {SliderSuperTab} from '../../slider';
import rootScope from '../../../lib/rootScope';
import SettingSection from '../../settingSection';
import CheckboxField from '../../checkboxField';
import Row, {CreateRowFromCheckboxField} from '../../row';
import {joinDeepPath} from '../../../helpers/object/setDeepProperty';
import I18n from '../../../lib/langPack';
import {setAppSettings} from '../../../stores/appSettings';
import Icon from '../../icon';

export default class AppClientSettingsPrivacyTab extends SliderSuperTab {
  public init() {
    this.container.classList.add('general-settings-container');
    this.setTitle('ClientSettings.Category.Privacy');

    const section = new SettingSection({
      name: 'ClientSettings.GhostMode'
    });

    const totalOptions = 5;

    const countSpan = document.createElement('span');
    countSpan.classList.add('accordion-counter');

    type GhostOptionName =
      'dontReadMessages' |
      'dontReadStories' |
      'dontSendOnline' |
      'dontSendTyping' |
      'goOfflineAutomatically';

    const ghostOptionCheckboxes: {name: GhostOptionName, checkbox: CheckboxField}[] = [];

    const ghostEnabledCheckbox = new CheckboxField({
      name: 'client-ghost-mode-enabled',
      toggle: true,
      listenerSetter: this.listenerSetter
    });

    const ghostHeaderRow = new Row({
      icon: 'ghost',
      titleLangKey: 'ClientSettings.GhostMode',
      checkboxField: ghostEnabledCheckbox,
      listenerSetter: this.listenerSetter
    });

    ghostHeaderRow.container.classList.add(
      'accordion-row',
      'accordion-toggler',
      'ghost-mode-header-row',
      'row-clickable',
      'hover-effect'
    );
    ghostHeaderRow.titleRow?.classList.add('with-delimiter');

    const accordionIcon = Icon('down', 'accordion-icon');
    ghostHeaderRow.title.append(' ', countSpan, ' ', accordionIcon);

    const accordion = document.createElement('div');
    accordion.classList.add('accordion');

    const setAccordionExpanded = (expanded: boolean) => {
      accordion.classList.toggle('is-expanded', expanded);
      ghostHeaderRow.container.classList.toggle('accordion-toggler-expanded', expanded);
    };

    const recalcFromCheckboxes = () => {
      const enabledCount = ghostOptionCheckboxes.reduce((acc, {checkbox}) => acc + (checkbox.checked ? 1 : 0), 0);
      countSpan.textContent = I18n.format('ClientSettings.GhostMode.Count', true, [enabledCount, totalOptions]);
      ghostEnabledCheckbox.setValueSilently(enabledCount === totalOptions);
    };

    const recalcFromSettings = (settings = rootScope.settings) => {
      const g = settings.client?.ghostMode;
      if(!g) return;

      ghostOptionCheckboxes.forEach(({name, checkbox}) => {
        // @ts-ignore
        checkbox.setValueSilently(!!g[name]);
      });

      recalcFromCheckboxes();
      setAccordionExpanded(g.expanded !== false);
    };

    const toggleAccordion = () => {
      const expanded = !accordion.classList.contains('is-expanded');
      setAccordionExpanded(expanded);
      setAppSettings('client', 'ghostMode', 'expanded', expanded);
    };

    ghostHeaderRow.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if(ghostEnabledCheckbox.label.contains(target)) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      toggleAccordion();
    });

    const makeGhostOption = (name: GhostOptionName, textKey: string) => {
      const checkbox = new CheckboxField({
        text: textKey as any,
        name,
        stateKey: joinDeepPath('settings', 'client', 'ghostMode', name),
        listenerSetter: this.listenerSetter
      });

      const row = CreateRowFromCheckboxField(checkbox);

      const rowWrapper = document.createElement('div');
      rowWrapper.classList.add('ghost-mode-checkbox-row');
      rowWrapper.append(row.container);

      ghostOptionCheckboxes.push({name, checkbox});

      this.listenerSetter.add(checkbox.input)('change', () => {
        if(name === 'goOfflineAutomatically' && checkbox.checked) {
          const dontSendOnline = ghostOptionCheckboxes.find((item) => item.name === 'dontSendOnline');
          if(dontSendOnline && !dontSendOnline.checkbox.checked) {
            dontSendOnline.checkbox.checked = true;
          }
        } else if(name === 'dontSendOnline' && !checkbox.checked) {
          const goOfflineAutomatically = ghostOptionCheckboxes.find((item) => item.name === 'goOfflineAutomatically');
          if(goOfflineAutomatically && goOfflineAutomatically.checkbox.checked) {
            goOfflineAutomatically.checkbox.checked = false;
          }
        }

        recalcFromCheckboxes();
      });

      accordion.append(rowWrapper);
    };

    section.content.append(ghostHeaderRow.container, accordion);

    makeGhostOption('dontReadMessages', 'ClientSettings.GhostMode.DontReadMessages');
    makeGhostOption('dontReadStories', 'ClientSettings.GhostMode.DontReadStories');
    makeGhostOption('dontSendOnline', 'ClientSettings.GhostMode.DontSendOnline');
    makeGhostOption('dontSendTyping', 'ClientSettings.GhostMode.DontSendTyping');
    makeGhostOption('goOfflineAutomatically', 'ClientSettings.GhostMode.GoOfflineAutomatically');

    const scheduleMessagesRow = new Row({
      titleLangKey: 'ClientSettings.GhostMode.ScheduleMessages',
      subtitleLangKey: 'ClientSettings.GhostMode.ScheduleMessages.Description',
      checkboxField: new CheckboxField({
        name: 'client-ghost-mode-schedule-messages',
        stateKey: joinDeepPath('settings', 'client', 'ghostMode', 'scheduleMessages'),
        listenerSetter: this.listenerSetter,
        toggle: true
      }),
      listenerSetter: this.listenerSetter
    });

    const sendWithoutSoundRow = new Row({
      titleLangKey: 'ClientSettings.GhostMode.SendWithoutSound',
      subtitleLangKey: 'ClientSettings.GhostMode.SendWithoutSound.Description',
      checkboxField: new CheckboxField({
        name: 'client-ghost-mode-send-without-sound',
        stateKey: joinDeepPath('settings', 'client', 'ghostMode', 'sendWithoutSound'),
        listenerSetter: this.listenerSetter,
        toggle: true
      }),
      listenerSetter: this.listenerSetter
    });

    section.content.append(scheduleMessagesRow.container, sendWithoutSoundRow.container);

    accordion.style.setProperty('--max-height', (ghostOptionCheckboxes.length * 48) + 'px');
    setAccordionExpanded(rootScope.settings.client?.ghostMode?.expanded !== false);

    this.listenerSetter.add(ghostEnabledCheckbox.input)('change', () => {
      const enabled = ghostEnabledCheckbox.checked;
      ghostOptionCheckboxes.forEach(({checkbox}) => {
        checkbox.checked = enabled;
      });
    });

    recalcFromSettings();

    this.listenerSetter.add(rootScope)('settings_updated', ({settings, key}) => {
      if(!key || key.indexOf('settings.client.ghostMode') !== 0) {
        return;
      }

      recalcFromSettings(settings);
    });

    this.scrollable.append(section.container);

    {
      const container = new SettingSection({
        name: 'ClientSettings.Confirmations'
      });

      const confirmations = [
        ['stickers', 'ClientSettings.Confirmations.Stickers'],
        ['gifs', 'ClientSettings.Confirmations.Gifs'],
        ['voiceMessages', 'ClientSettings.Confirmations.VoiceMessages']
      ] as const;

      confirmations.forEach(([key, langKey]) => {
        const row = new Row({
          titleLangKey: langKey,
          checkboxField: new CheckboxField({
            name: `client-confirmations-${key}`,
            stateKey: joinDeepPath('settings', 'client', 'confirmations', key),
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


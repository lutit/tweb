import {SliderSuperTabEventable} from '../../sliderTab';
import rootScope from '../../../lib/rootScope';
import {generateSection} from '../../settingSection';
import CheckboxField from '../../checkboxField';
import Row, {CreateRowFromCheckboxField} from '../../row';
import {joinDeepPath} from '../../../helpers/object/setDeepProperty';
import I18n from '../../../lib/langPack';
import appImManager from '../../../lib/appManagers/appImManager';
import Button from '../../button';
import Icon from '../../icon';
import safeWindowOpen from '../../../helpers/dom/safeWindowOpen';

export default class AppClientSettingsTab extends SliderSuperTabEventable {
  public init() {
    this.container.classList.add('general-settings-container');
    this.setTitle('ClientSettings.MenuTitle');

    const section = generateSection.bind(null, this.scrollable);

    {
      const container = section('ClientSettings.GhostMode');

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
        rightContent: ghostEnabledCheckbox.label,
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
      };

      const toggleAccordion = () => {
        const expanded = !accordion.classList.contains('is-expanded');
        accordion.classList.toggle('is-expanded', expanded);
        ghostHeaderRow.container.classList.toggle('accordion-toggler-expanded', expanded);
      };

      ghostHeaderRow.container.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if(ghostEnabledCheckbox.label.contains(target)) {
          // Click on the switch: do not toggle accordion, keep existing switch flow.
          return;
        }

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

        accordion.append(row.container);
      };

      container.append(ghostHeaderRow.container, accordion);

      makeGhostOption('dontReadMessages', 'ClientSettings.GhostMode.DontReadMessages');
      makeGhostOption('dontReadStories', 'ClientSettings.GhostMode.DontReadStories');
      makeGhostOption('dontSendOnline', 'ClientSettings.GhostMode.DontSendOnline');
      makeGhostOption('dontSendTyping', 'ClientSettings.GhostMode.DontSendTyping');
      makeGhostOption('goOfflineAutomatically', 'ClientSettings.GhostMode.GoOfflineAutomatically');

      accordion.style.setProperty('--max-height', (ghostOptionCheckboxes.length * 48) + 'px');
      accordion.classList.add('is-expanded');
      ghostHeaderRow.container.classList.add('accordion-toggler-expanded');

      // When Ghost Mode switch changes, toggle all child checkboxes.
      this.listenerSetter.add(ghostEnabledCheckbox.input)('change', () => {
        const enabled = ghostEnabledCheckbox.checked;
        ghostOptionCheckboxes.forEach(({checkbox}) => {
          checkbox.checked = enabled;
        });
        // recalcFromCheckboxes will be triggered by child change listeners.
      });

      // Initial sync from current settings
      recalcFromSettings();

      // Keep in sync if something else updates ghost mode settings
      this.listenerSetter.add(rootScope)('settings_updated', ({settings, key}) => {
        if(!key || key.indexOf('settings.client.ghostMode') !== 0) {
          return;
        }

        recalcFromSettings(settings);
      });
    }

    {
      const container = section('ClientSettings.Chats');

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

      container.append(row.container);
    }

    {
      const container = section('ClientSettings.Premium');

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

      container.append(localPremiumRow.container, disableAdsRow.container, forceCopyRow.container);
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

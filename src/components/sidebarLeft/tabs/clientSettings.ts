import {SliderSuperTabEventable} from '../../sliderTab';
import rootScope from '../../../lib/rootScope';
import {generateSection} from '../../settingSection';
import CheckboxField from '../../checkboxField';
import Row, {CreateRowFromCheckboxField} from '../../row';
import RadioField from '../../radioField';
import {joinDeepPath} from '../../../helpers/object/setDeepProperty';
import I18n from '../../../lib/langPack';
import appImManager from '../../../lib/appManagers/appImManager';
import {replaceButtonIcon} from '../../button';
import Icon from '../../icon';
import safeWindowOpen from '../../../helpers/dom/safeWindowOpen';
import {setAppSettings} from '../../../stores/appSettings';

export default class AppClientSettingsTab extends SliderSuperTabEventable {
  public init() {
    this.container.classList.add('general-settings-container');
    this.setTitle('ClientSettings.MenuTitle');

    const isInSettingsPopup = !!this.container.closest('.settings-slider-popup__height-limit');
    if(isInSettingsPopup) {
      replaceButtonIcon(this.closeBtn as HTMLElement, 'close');
    }

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
          // Click on the switch: do not toggle accordion, keep existing switch flow.
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

      container.append(ghostHeaderRow.container, accordion);

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

      container.append(scheduleMessagesRow.container, sendWithoutSoundRow.container);

      accordion.style.setProperty('--max-height', (ghostOptionCheckboxes.length * 48) + 'px');
      setAccordionExpanded(rootScope.settings.client?.ghostMode?.expanded !== false);

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

      container.append(row.container, serviceTimeRow.container);
    }

    {
      const container = section('ClientSettings.Confirmations');
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

        container.append(row.container);
      });
    }

    {
      const container = section('ClientSettings.Profile');

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

      container.append(hidePhoneRow.container);
    }

    {
      const container = section('ClientSettings.Id');

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
      container.append(form);
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

      container.append(localPremiumRow.container, disableAdsRow.container);
    }

    {
      const container = section('ClientSettings.AyuMoments');

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

      container.append(forceCopyRow.container);
    }

    {
      const container = section('ClientSettings.ContextMenu');

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

        container.append(row.container);
      });
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

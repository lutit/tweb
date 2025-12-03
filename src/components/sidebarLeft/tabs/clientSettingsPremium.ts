import {SliderSuperTab} from '../../slider';
import SettingSection from '../../settingSection';
import Row from '../../row';
import CheckboxField from '../../checkboxField';
import {joinDeepPath} from '../../../helpers/object/setDeepProperty';
import rootScope from '../../../lib/rootScope';
import {setAppSettings} from '../../../stores/appSettings';
import Icon from '../../icon';

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

      const ayuCoreOptions = [
        {label: 'ClientSettings.AyuMoments.SaveDeleted', key: joinDeepPath('settings', 'client', 'ayuMoments', 'saveDeleted'), name: 'client-ayu-save-deleted', prop: 'saveDeleted' as const},
        {label: 'ClientSettings.AyuMoments.SaveEdited', key: joinDeepPath('settings', 'client', 'ayuMoments', 'saveEdited'), name: 'client-ayu-save-edited', prop: 'saveEdited' as const},
        {label: 'ClientSettings.AyuMoments.IncludeBots', key: joinDeepPath('settings', 'client', 'ayuMoments', 'includeBots'), name: 'client-ayu-include-bots', prop: 'includeBots' as const}
      ];

      const coreCountSpan = document.createElement('span');
      coreCountSpan.classList.add('accordion-counter');

      const coreHeaderRow = new Row({
        titleLangKey: 'ClientSettings.AyuMoments.Capture',
        listenerSetter: this.listenerSetter
      });

      coreHeaderRow.container.classList.add(
        'accordion-row',
        'accordion-toggler',
        'row-clickable',
        'hover-effect'
      );
      coreHeaderRow.titleRow?.classList.add('with-delimiter');

      const accordionIcon = Icon('down', 'accordion-icon');
      coreHeaderRow.title.append(' ', coreCountSpan, ' ', accordionIcon);

      const accordion = document.createElement('div');
      accordion.classList.add('accordion');

      const setAccordionExpanded = (expanded: boolean) => {
        accordion.classList.toggle('is-expanded', expanded);
        coreHeaderRow.container.classList.toggle('accordion-toggler-expanded', expanded);
      };

      const toggleAccordion = () => {
        const expanded = !accordion.classList.contains('is-expanded');
        setAccordionExpanded(expanded);
        setAppSettings('client', 'ayuMoments', 'expanded', expanded);
      };

      coreHeaderRow.container.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleAccordion();
      });

      const coreOptionCheckboxes: {prop: (typeof ayuCoreOptions)[number]['prop'], checkbox: CheckboxField}[] = [];

      const recalcFromCheckboxes = () => {
        const enabledCount = coreOptionCheckboxes.reduce((acc, {checkbox}) => acc + (checkbox.checked ? 1 : 0), 0);
        coreCountSpan.textContent = `${enabledCount}/${ayuCoreOptions.length}`;
      };

      ayuCoreOptions.forEach(({label, key, name, prop}) => {
        const checkbox = new CheckboxField({
          name,
          stateKey: key,
          toggle: true,
          listenerSetter: this.listenerSetter
        });

        const row = new Row({
          titleLangKey: label,
          checkboxField: checkbox,
          listenerSetter: this.listenerSetter
        });

        const rowWrapper = document.createElement('div');
        rowWrapper.classList.add('ghost-mode-checkbox-row');
        rowWrapper.append(row.container);
        accordion.append(rowWrapper);

        this.listenerSetter.add(checkbox.input)('change', () => {
          recalcFromCheckboxes();
        });

        coreOptionCheckboxes.push({prop, checkbox});
      });

      const applySettings = (settings = rootScope.settings) => {
        const ayu = settings.client?.ayuMoments;
        if(!ayu) return;

        coreOptionCheckboxes.forEach(({prop, checkbox}) => {
          checkbox.setValueSilently(!!ayu[prop]);
        });

        recalcFromCheckboxes();
        setAccordionExpanded(ayu.expanded !== false);
      };

      accordion.style.setProperty('--max-height', (ayuCoreOptions.length * 48) + 'px');

      setAccordionExpanded(true);
      recalcFromCheckboxes();
      applySettings();

      this.listenerSetter.add(rootScope)('settings_updated', ({settings, key}) => {
        if(!key || key.indexOf('settings.client.ayuMoments') !== 0) {
          return;
        }

        applySettings(settings);
      });

      container.content.append(coreHeaderRow.container, accordion);

      const additionalToggles = [
        {label: 'ClientSettings.AyuMoments.SaveReactions', key: joinDeepPath('settings', 'client', 'ayuMoments', 'saveReactions'), name: 'client-ayu-save-reactions'},
        {label: 'ClientSettings.AyuMoments.KeepPrompt', key: joinDeepPath('settings', 'client', 'ayuMoments', 'keepLocallyPrompt'), name: 'client-ayu-keep-prompt'},
        {label: 'ClientSettings.AyuMoments.KeepDefaultOn', key: joinDeepPath('settings', 'client', 'ayuMoments', 'keepLocallyDefaultOn'), name: 'client-ayu-keep-default'}
      ] as const;

      additionalToggles.forEach(({label, key, name}) => {
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

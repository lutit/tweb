import {SliderSuperTab} from '../../slider';
import SettingSection from '../../settingSection';
import Row from '../../row';
import CheckboxField from '../../checkboxField';
import InputField from '../../inputField';
import ButtonCorner from '../../buttonCorner';
import {useAppSettings, setAppSettings} from '../../../stores/appSettings';
import type {LangPackKey} from '../../../lib/langPack';
import type {LangPackLanguage} from '../../../layer';
import rootScope from '../../../lib/rootScope';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import ButtonMenuToggle from '../../buttonMenuToggle';
import type {ButtonMenuItemOptionsVerifiable} from '../../buttonMenu';
import confirmationPopup from '../../confirmationPopup';

export default class AppClientSessionSpoofTab extends SliderSuperTab {
  public static getInitArgs() {
    return {
      languages: rootScope.managers.apiManager.invokeApiCacheable('langpack.getLanguages', {
        lang_pack: 'web'
      }) as Promise<LangPackLanguage[]>
    };
  }

  public async init(p: ReturnType<typeof AppClientSessionSpoofTab['getInitArgs']> = AppClientSessionSpoofTab.getInitArgs()) {
    this.container.classList.add('client-session-spoof-container');
    this.setTitle('ClientSettings.Spoof.MenuTitle');

    const [appSettings] = useAppSettings();

    const section = new SettingSection({
      name: 'ClientSettings.Spoof.SectionTitle',
      caption: 'ClientSettings.Spoof.SectionCaption'
    });

    const spoof = appSettings.client?.sessionSpoof ?? {enabled: false};
    const draft: typeof spoof = {...spoof};

    const applyBtn = ButtonCorner({icon: 'check'});
    applyBtn.classList.remove('is-visible');
    this.content.append(applyBtn);

    const isDirty = () => {
      return !!draft.enabled !== !!spoof.enabled ||
        (draft.deviceModel || '') !== (spoof.deviceModel || '') ||
        (draft.systemVersion || '') !== (spoof.systemVersion || '') ||
        (draft.appVersion || '') !== (spoof.appVersion || '') ||
        (draft.systemLangCode || '') !== (spoof.systemLangCode || '') ||
        (draft.langCode || '') !== (spoof.langCode || '');
    };

    const updateFabVisibility = () => {
      const dirty = isDirty();
      applyBtn.classList.toggle('is-visible', dirty);
      applyBtn.toggleAttribute('disabled', !dirty);
    };

    const enabledCheckbox = new CheckboxField({
      name: 'client-session-spoof-enabled',
      listenerSetter: this.listenerSetter,
      toggle: true
    });
    enabledCheckbox.setValueSilently(!!draft.enabled);

    const enabledRow = new Row({
      titleLangKey: 'ClientSettings.Spoof.Enable',
      checkboxField: enabledCheckbox,
      listenerSetter: this.listenerSetter
    });

    this.listenerSetter.add(enabledCheckbox.input)('change', () => {
      draft.enabled = enabledCheckbox.checked;
      updateFabVisibility();
    });

    section.content.append(enabledRow.container);

    const makeInput = (key: keyof Pick<typeof draft, 'deviceModel' | 'systemVersion' | 'appVersion'>, label: LangPackKey) => {
      const field = new InputField({
        plainText: true,
        label,
        onRawInput: (value) => {
          const v = (value as string).trim();
          draft[key] = v || undefined;
          updateFabVisibility();
        }
      });

      if(spoof && typeof spoof[key] === 'string') {
        field.setDraftValue(spoof[key] as string, true);
      }

      const wrapper = document.createElement('div');
      wrapper.classList.add('input-wrapper');
      wrapper.append(field.container);

      section.content.append(wrapper);

      return field;
    };

    makeInput('deviceModel', 'ClientSettings.Spoof.DeviceModel');
    makeInput('systemVersion', 'ClientSettings.Spoof.SystemVersion');
    makeInput('appVersion', 'ClientSettings.Spoof.AppVersion');

    const languages = await p.languages;
    const languageOptions = languages.map((language) => {
      const parts: string[] = [];
      if(language.name) parts.push(language.name);
      if(language.native_name && language.native_name !== language.name) {
        parts.push(language.native_name);
      }

      const label = parts.length ? parts.join(' / ') : language.lang_code;
      return {
        code: language.lang_code,
        label
      };
    });

    const getLangLabel = (code?: string) => {
      if(!code) return '';
      const option = languageOptions.find((opt) => opt.code === code);
      if(!option) return code;
      return `${option.label} (${option.code})`;
    };

    const makeLangRow = (key: 'systemLangCode' | 'langCode', titleKey: LangPackKey, radioGroup: string) => {
      const row = new Row({
        titleLangKey: titleKey,
        subtitle: true,
        listenerSetter: this.listenerSetter
      });

      const updateSubtitle = () => {
        const value = draft[key];
        row.subtitle.textContent = value ? getLangLabel(value) : '—';
      };

      updateSubtitle();

      const buttons: ButtonMenuItemOptionsVerifiable[] = [];

      buttons.push({
        regularText: '—',
        onClick: () => {
          draft[key] = undefined;
          updateSubtitle();
          updateFabVisibility();
        },
        radioGroup
      });

      languageOptions.forEach((option) => {
        buttons.push({
          regularText: option.label + ' (' + option.code + ')',
          onClick: () => {
            draft[key] = option.code;
            updateSubtitle();
            updateFabVisibility();
          },
          radioGroup
        });
      });

      ButtonMenuToggle({
        container: row.container,
        listenerSetter: this.listenerSetter,
        direction: 'bottom-left',
        buttons,
        noIcon: true
      });

      section.content.append(row.container);
    };

    makeLangRow('systemLangCode', 'ClientSettings.Spoof.SystemLangCode', 'client-session-spoof-system-lang');
    makeLangRow('langCode', 'ClientSettings.Spoof.LangCode', 'client-session-spoof-lang-code');

    attachClickEvent(applyBtn, async() => {
      if(!isDirty()) {
        return;
      }

      const prevEnabled = !!spoof.enabled;
      const nextEnabled = !!draft.enabled;
      const needReload = prevEnabled || nextEnabled;

      if(needReload) {
        try {
          await confirmationPopup({
            descriptionLangKey: 'ClientSettings.Spoof.Confirm.Description',
            button: {
              langKey: 'ClientSettings.Spoof.Confirm.Button',
              isDanger: true
            }
          });
        } catch {
          return;
        }
      }

      const value = {
        enabled: nextEnabled,
        deviceModel: draft.deviceModel || undefined,
        systemVersion: draft.systemVersion || undefined,
        appVersion: draft.appVersion || undefined,
        systemLangCode: draft.systemLangCode || undefined,
        langCode: draft.langCode || undefined
      };

      await setAppSettings('client', 'sessionSpoof', value);

      if(needReload) {
        location.reload();
      } else {
        spoof.enabled = value.enabled;
        spoof.deviceModel = value.deviceModel;
        spoof.systemVersion = value.systemVersion;
        spoof.appVersion = value.appVersion;
        spoof.systemLangCode = value.systemLangCode;
        spoof.langCode = value.langCode;

        draft.enabled = value.enabled;
        draft.deviceModel = value.deviceModel;
        draft.systemVersion = value.systemVersion;
        draft.appVersion = value.appVersion;
        draft.systemLangCode = value.systemLangCode;
        draft.langCode = value.langCode;

        updateFabVisibility();
      }
    }, {listenerSetter: this.listenerSetter});

    updateFabVisibility();

    this.scrollable.append(section.container);
  }
}

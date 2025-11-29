import {createRoot, createSignal} from 'solid-js';
import rootScope from '../lib/rootScope';

const [premium, setPremium] = createRoot(() => createSignal(rootScope.premium));

let serverPremium = rootScope.premium;
let localPremium = !!rootScope.settings?.client?.premium?.localPremium;

const recompute = () => {
  setPremium(serverPremium || localPremium);
};

const onAuth = () => {
  localPremium = !!rootScope.settings?.client?.premium?.localPremium;
  recompute();

  rootScope.managers.rootScope.getPremium().then((value) => {
    serverPremium = value;
    recompute();
  });
};

rootScope.addEventListener('premium_toggle', (value) => {
  serverPremium = value;
  recompute();
});

rootScope.addEventListener('settings_updated', ({settings}) => {
  localPremium = !!settings.client?.premium?.localPremium;
  recompute();
});

if(rootScope.myId) {
  onAuth();
} else {
  rootScope.addEventListener('user_auth', onAuth);
}

export default function usePremium() {
  return premium;
}

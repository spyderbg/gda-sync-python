import { createApp, defineAsyncComponent } from 'vue';
import '@fontsource-variable/roboto';
import './styles/icons.scss';
import './theme/staradmin/scss/shared/style.scss';
import './theme/staradmin/scss/demo_1/style.scss';
import './styles/app.scss';
import App from './App.vue';
import { GAME_TOOLS_PATH } from './game/debug/GameToolsWindow';

// The Game tools page (the game's debug tools in a window of their own) is a page of its own; every other address is the
// app's.
const root = window.location.pathname === GAME_TOOLS_PATH ? defineAsyncComponent(() => import('./game/GameToolsPage.vue')) : App;

createApp(root).mount('#root');

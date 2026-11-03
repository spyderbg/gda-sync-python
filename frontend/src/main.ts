import { createApp } from 'vue';
import '@fontsource-variable/roboto';
import './styles/icons.scss';
import './theme/staradmin/scss/shared/style.scss';
import './theme/staradmin/scss/demo_1/style.scss';
import './styles/app.scss';
import App from './App.vue';
import { ui } from './workspace';

// Existing tools bookmarks now open the tools within the application navigation.
if (window.location.pathname === '/game-tools') ui.view = 'gameTools';

createApp(App).mount('#root');

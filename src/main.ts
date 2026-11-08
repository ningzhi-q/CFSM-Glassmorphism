import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import './styles/main.css'
import { loadCityNames } from '@/services/city-names'

createApp(App)
  .use(createPinia())
  .use(router)
  .mount('#app')

void loadCityNames()

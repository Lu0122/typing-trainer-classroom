import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import 'element-plus/dist/index.css';
import './style.css';
import AdminNext from './AdminNext.vue';

createApp(AdminNext).use(ElementPlus, { locale: zhCn }).mount('#admin-next');

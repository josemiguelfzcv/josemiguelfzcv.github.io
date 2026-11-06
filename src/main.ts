import './style.css';
import { startApp } from './app';

startApp().catch((err) => {
  console.error(err);
  const msg = document.getElementById('loader-msg');
  if (msg) msg.textContent = 'Something went wrong while generating the world. Please reload.';
});

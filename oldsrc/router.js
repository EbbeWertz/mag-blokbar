// router.js
import { state } from './config.js';
import { initScherm, initDash } from './main.js';

const pDash = document.getElementById('page-dashboard');
const pScherm = document.getElementById('page-scherm');
const idModal = document.getElementById('id-modal');

export function route() {
  const hash = location.hash;
  const isScherm = hash === '#scherm' || hash === '#/scherm';
  
  if (pDash) pDash.classList.toggle('active', !isScherm);
  if (pScherm) pScherm.classList.toggle('active', isScherm);
  if (idModal) idModal.classList.toggle('gone', isScherm || !!state.myName);
  
  if (isScherm) { 
    initScherm(); 
  } else { 
    initDash(); 
  }
}
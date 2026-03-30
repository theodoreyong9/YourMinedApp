/* jshint esversion:11 */
(function(){
'use strict';
window.YM_S = window.YM_S || {};

window.YM_S['mysphere.sphere.js'] = {
  name: 'MySphere',
  icon: '⬡',
  category: 'Other',
  description: 'ok',
  emit: [], receive: [],

  activate(ctx) {},
  deactivate() {},

  renderPanel(container) {
    container.innerHTML = '<div style="padding:16px">Hello!</div>';
  }
};
})();
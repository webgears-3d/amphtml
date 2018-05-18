/**
 * Copyright 2018 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import {Deferred} from '../../../src/utils/promise';
import {dev} from '../../../src/log';
import {dict} from '../../../src/utils/object';
import {getIframe, preloadBootstrap} from '../../../src/3p-frame';
import {isLayoutSizeDefined} from '../../../src/layout';
import {listenFor, postMessage} from '../../../src/iframe-helper';
import {removeElement} from '../../../src/dom';
import {assertHttpsUrl} from '../../../src/url';

const isWebGLSupported = () => {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl')
      || canvas.getContext('experimental-webgl');
  return gl && gl instanceof WebGLRenderingContext;
};

export class Amp3dGltf extends AMP.BaseElement {

  /** @param {!AmpElement} element */
  constructor(element) {
    super(element);

    /** @private {?Element} */
    this.iframe_ = null;

    /** @private {!Deferred} */
    this.willBeReady_ = new Deferred();

    /** @private {!Deferred} */
    this.willBeLoaded_ = new Deferred();

    /** @private {!JsonObject} */
    this.context_ = dict();

    /** @private {?Function} */
    this.unlistenMessage_ = null;
  }

  /**
   * @param {boolean=} opt_onLayout
   * @override
   */
  preconnectCallback(opt_onLayout) {
    preloadBootstrap(this.win, this.preconnect);
    this.preconnect.url('https://cdnjs.cloudflare.com/ajax/libs/three.js/91/three.js', opt_onLayout);
    this.preconnect.url('https://cdn.jsdelivr.net/npm/three@0.91/examples/js/loaders/GLTFLoader.js', opt_onLayout);
    this.preconnect.url('https://cdn.jsdelivr.net/npm/three@0.91/examples/js/controls/OrbitControls.js', opt_onLayout);
  }

  /** @override */
  unlayoutCallback() {
    if (this.iframe_) {
      removeElement(this.iframe_);
      this.iframe_ = null;
    }
    if (this.unlistenMessage_) {
      this.unlistenMessage_();
    }

    this.willBeReady_ = new Deferred();
    this.willBeLoaded_ = new Deferred();

    return true;
  }

  /** @override */
  buildCallback() {
    const getOption = (name, fmt, dflt) =>
      this.element.hasAttribute(name)
        ? fmt(this.element.getAttribute(name))
        : dflt;

    const bool = x => x !== 'false';
    const string = x => x;
    const number = x => parseFloat(x);

    const src = assertHttpsUrl(
        getOption('src', string, ''),
        this.element);

    this.context_ = dict({
      'src': src,
      'renderer': {
        'alpha': getOption('alpha', bool, false),
        'antialias': getOption('antialiasing', bool, true),
      },
      'maxPixelRatio':
          getOption('maxPixelRatio', number, devicePixelRatio || 1),
      'controls': {
        'enableZoom': getOption('enableZoom', bool, true),
        'autoRotate': getOption('autoRotate', bool, false),
      },
      'hostUrl': this.win.location.href,
    });
  }

  /** @override */
  layoutCallback() {
    if (!isWebGLSupported()) {
      this.toggleFallback(true);
      return Promise.resolve();
    }

    const iframe = getIframe(
        this.win, this.element, '3d-gltf', this.context_
    );

    this.applyFillContent(iframe, true);
    this.iframe_ = iframe;
    this.unlistenMessage_ = this.listenGltfViewerMessages_();

    this.element.appendChild(iframe);

    return this.willBeLoaded_.promise;
  }

  /** @private */
  listenGltfViewerMessages_() {
    if (!this.iframe_) {
      return;
    }

    const listenIframe = (evName, cb) => listenFor(
        dev().assertElement(this.iframe_),
        evName,
        cb,
        true);

    const disposers = [
      listenIframe('ready', this.willBeReady_.resolve),
      listenIframe('loaded', this.willBeLoaded_.resolve),
      listenIframe('error', () => {
        this.toggleFallback(true);
      }),
    ];
    return () => disposers.forEach(d => d());
  }

  /**
   * Sends a command to the viewer through postMessage.
   * @param {string} action
   * @param {(JsonObject|boolean)=} args
   * @private
   * */
  sendCommand_(action, args) {
    this.willBeReady_.promise.then(() => {
      const message = dict({
        'action': action,
        'args': args,
      });

      postMessage(
          dev().assertElement(this.iframe_),
          'action',
          message,
          '*',
          true);
    });
  }

  /**
   * @param {boolean} inViewport
   * @override
   */
  viewportCallback(inViewport) {
    this.sendCommand_('toggleAmpViewport', inViewport);
  }

  /** @override */
  pauseCallback() {
    this.sendCommand_('toggleAmpPlay', false);
  }

  /** @override */
  resumeCallback() {
    this.sendCommand_('toggleAmpPlay', true);
  }

  onLayoutMeasure() {
    const box = this.getLayoutBox();
    this.sendCommand_(
        'setSize',
        dict({'width': box.width, 'height': box.height}));
  }

  /**
   * @override
   * @param {!Layout} layout
   * @return {boolean}
   */
  isLayoutSupported(layout) {
    return isLayoutSizeDefined(layout);
  }
}

AMP.registerElement('amp-3d-gltf', Amp3dGltf);

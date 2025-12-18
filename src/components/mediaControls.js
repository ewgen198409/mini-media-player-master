import { LitElement, html, css } from 'lit-element';
import { classMap } from 'lit-html/directives/class-map';

import { ICON, REPEAT_STATE } from '../const';
import sharedStyle from '../sharedStyle';

class MiniMediaPlayerMediaControls extends LitElement {
  static get properties() {
    return {
      player: {},
      config: {},
      break: Boolean,
      barCount: { type: Number },
    };
  }

  get showShuffle() {
    return !this.config.hide.shuffle && this.player.supportsShuffle;
  }

  get showRepeat() {
    return !this.config.hide.repeat && this.player.supportsRepeat;
  }

  get maxVol() {
    return this.config.max_volume || 100;
  }

  get minVol() {
    return this.config.min_volume || 0;
  }

  get vol() {
    return Math.round(this.player.vol * 100);
  }

  get jumpAmount() {
    return this.config.jump_amount || 10;
  }

  constructor() {
    super();
    this.barCount = 20;
  }

  firstUpdated() {
    this.updateBarCountAndWidth();
    this.resizeObserver = new ResizeObserver(() => this.updateBarCountAndWidth());
    this.resizeObserver.observe(this.shadowRoot.host.parentElement); // наблюдаем за родителем (карточкой)
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.resizeObserver) this.resizeObserver.disconnect();
  }

  // Рассчитываем количество баров и устанавливаем точную ширину контейнера
  updateBarCountAndWidth() {
    const volumeDiv = this.shadowRoot.querySelector('.mmp-media-controls__volume');
    if (!volumeDiv) return;

    // Доступная ширина для баров (учитываем mute-кнопку и уровень громкости, если есть)
    const availableWidth = volumeDiv.clientWidth - 60; // ~60px на mute + отступы + % (примерно)

    const barWidth = 8;
    const gap = 4;
    const spacePerBar = barWidth + gap;

    let count = Math.floor((availableWidth + gap) / spacePerBar); // +gap для максимального использования
    count = Math.max(10, Math.min(50, count));

    if (count !== this.barCount) {
      this.barCount = count;
      this.requestUpdate();
    }

    // Устанавливаем точную ширину контейнера баров
    const container = this.shadowRoot.querySelector('.volume-bars-container');
    if (container) {
      const totalBarsWidth = count * barWidth + (count - 1) * gap;
      container.style.width = `${totalBarsWidth + 16}px`; // +16px на padding-left/right (по 8px)
      container.style.flex = 'none';
    }
  }

  render() {
    const { hide } = this.config;
    return html`
      ${!hide.volume ? this.renderVolControls(this.player.muted) : html``}
      ${this.renderShuffleButton()}
      ${this.renderRepeatButton()}
      ${!hide.controls ? html`
        <div class='flex mmp-media-controls__media' ?flow=${this.config.flow || this.break}>
          ${!hide.prev && this.player.supportsPrev ? html`
            <ha-icon-button @click=${e => this.player.prev(e)} .icon=${ICON.PREV}>
              <ha-icon .icon=${ICON.PREV}></ha-icon>
            </ha-icon-button>` : ''}
          ${this.renderJumpBackwardButton()}
          ${this.renderPlayButtons()}
          ${this.renderJumpForwardButton()}
          ${!hide.next && this.player.supportsNext ? html`
            <ha-icon-button @click=${e => this.player.next(e)} .icon=${ICON.NEXT}>
              <ha-icon .icon=${ICON.NEXT}></ha-icon>
            </ha-icon-button>` : ''}
        </div>
      ` : html``}
    `;
  }

  renderShuffleButton() {
    return this.showShuffle ? html`
      <div class='flex mmp-media-controls__shuffle'>
        <ha-icon-button
          class='shuffle-button'
          @click=${e => this.player.toggleShuffle(e)}
          .icon=${ICON.SHUFFLE}
          ?color=${this.player.shuffle}>
          <ha-icon .icon=${ICON.SHUFFLE}></ha-icon>
        </ha-icon-button>
      </div>
    ` : html``;
  }

  renderRepeatButton() {
    if (!this.showRepeat) return html``;

    const colored = [REPEAT_STATE.ONE, REPEAT_STATE.ALL].includes(this.player.repeat);
    return html`
      <div class='flex mmp-media-controls__repeat'>
        <ha-icon-button
          class='repeat-button'
          @click=${e => this.player.toggleRepeat(e)}
          .icon=${ICON.REPEAT[this.player.repeat]}
          ?color=${colored}>
          <ha-icon .icon=${ICON.REPEAT[this.player.repeat]}></ha-icon>
        </ha-icon-button>
      </div>
    `;
  }

  renderVolControls(muted) {
    const volumeControls = this.config.volume_stateless
      ? this.renderVolButtons(muted)
      : this.renderVolBars(muted);

    const classes = classMap({
      '--buttons': this.config.volume_stateless,
      'mmp-media-controls__volume': true,
      flex: true,
    });

    const showVolumeLevel = !this.config.hide.volume_level;
    return html`
      <div class=${classes}>
        ${volumeControls}
        ${showVolumeLevel ? this.renderVolLevel() : ''}
      </div>`;
  }

  renderVolBars(muted) {
    const barCount = this.barCount || 20;
    const volPercent = muted ? 0 : this.vol;
    const activeCount = Math.round((volPercent / 100) * barCount);

    const bars = Array.from({ length: barCount }, (_, i) => {
      const isActive = i < activeCount;
      return html`<div class="volume-bar ${isActive ? 'active' : 'inactive'} ${muted ? 'muted' : ''}"></div>`;
    });

    return html`
      ${this.renderMuteButton(muted)}
      <div class="volume-bars-container" @click=${(e) => this.handleContainerClick(e, barCount)} ?disabled=${muted}>
        ${bars}
        <input
          type="range"
          class="invisible-slider"
          @input=${this.handleVolumeChange}
          @click=${e => e.stopPropagation()}
          ?disabled=${muted}
          min=${this.minVol}
          max=${this.maxVol}
          .value=${volPercent}
          step=${this.config.volume_step || 1}>
      </div>
    `;
  }

  handleContainerClick(e, barCount) {
    if (this.player.muted) return;

    const container = e.currentTarget;
    const rect = container.getBoundingClientRect();
    const clickX = e.clientX - rect.left;

    const paddingLeft = 8; // из CSS
    const effectiveX = clickX - paddingLeft;

    if (effectiveX <= 0) {
      this.player.setVolume(null, 0);
      return;
    }

    const barWidth = 8;
    const gap = 4;
    const oneUnit = barWidth + gap;

    let index = Math.floor(effectiveX / oneUnit);
    index = Math.min(index, barCount - 1);

    const newVol = (index + 1) / barCount;
    this.player.setVolume(null, newVol);
  }

  renderVolButtons(muted) {
    return html`
      ${this.renderMuteButton(muted)}
      <ha-icon-button @click=${e => this.player.volumeDown(e)} .icon=${ICON.VOL_DOWN}>
        <ha-icon .icon=${ICON.VOL_DOWN}></ha-icon>
      </ha-icon-button>
      <ha-icon-button @click=${e => this.player.volumeUp(e)} .icon=${ICON.VOL_UP}>
        <ha-icon .icon=${ICON.VOL_UP}></ha-icon>
      </ha-icon-button>
    `;
  }

  renderVolLevel() {
    return html`<span class="mmp-media-controls__volume__level">${this.vol}%</span>`;
  }

  renderMuteButton(muted) {
    if (this.config.hide.mute) return;
    switch (this.config.replace_mute) {
      case 'play':
      case 'play_pause':
      case 'stop':
      case 'play_stop':
      case 'next':
        // ... (твой код остался без изменений)
        // (для краткости не копирую, оставь как был)
      default:
        if (!this.player.supportsMute) return;
        return html`
          <ha-icon-button @click=${e => this.player.toggleMute(e)} .icon=${ICON.MUTE[muted]}>
            <ha-icon .icon=${ICON.MUTE[muted]}></ha-icon>
          </ha-icon-button>
        `;
    }
  }
  renderMuteButton(muted) {
    if (this.config.hide.mute) return;
    switch (this.config.replace_mute) {
      case 'play':
      case 'play_pause':
        return html`<ha-icon-button @click=${e => this.player.playPause(e)} .icon=${ICON.PLAY[this.player.isPlaying]}>
          <ha-icon .icon=${ICON.PLAY[this.player.isPlaying]}></ha-icon>
        </ha-icon-button>`;
      case 'stop':
        return html`<ha-icon-button @click=${e => this.player.stop(e)} .icon=${ICON.STOP.true}>
          <ha-icon .icon=${ICON.STOP.true}></ha-icon>
        </ha-icon-button>`;
      case 'play_stop':
        return html`<ha-icon-button @click=${e => this.player.playStop(e)} .icon=${ICON.STOP[this.player.isPlaying]}>
          <ha-icon .icon=${ICON.STOP[this.player.isPlaying]}></ha-icon>
        </ha-icon-button>`;
      case 'next':
        return html`<ha-icon-button @click=${e => this.player.next(e)} .icon=${ICON.NEXT}>
          <ha-icon .icon=${ICON.NEXT}></ha-icon>
        </ha-icon-button>`;
      default:
        if (!this.player.supportsMute) return;
        return html`<ha-icon-button @click=${e => this.player.toggleMute(e)} .icon=${ICON.MUTE[muted]}>
          <ha-icon .icon=${ICON.MUTE[muted]}></ha-icon>
        </ha-icon-button>`;
    }
  }

  renderPlayButtons() {
    const { hide } = this.config;
    return html`
      ${!hide.play_pause ? this.player.assumedState ? html`
        <ha-icon-button @click=${e => this.player.play(e)} .icon=${ICON.PLAY.false}>
          <ha-icon .icon=${ICON.PLAY.false}></ha-icon>
        </ha-icon-button>
        <ha-icon-button @click=${e => this.player.pause(e)} .icon=${ICON.PLAY.true}>
          <ha-icon .icon=${ICON.PLAY.true}></ha-icon>
        </ha-icon-button>
      ` : html`
        <ha-icon-button @click=${e => this.player.playPause(e)} .icon=${ICON.PLAY[this.player.isPlaying]}>
          <ha-icon .icon=${ICON.PLAY[this.player.isPlaying]}></ha-icon>
        </ha-icon-button>
      ` : html``}
      ${!hide.play_stop ? html`
        <ha-icon-button @click=${e => this.handleStop(e)}
          .icon=${hide.play_pause ? ICON.STOP[this.player.isPlaying] : ICON.STOP.true}>
          <ha-icon .icon=${hide.play_pause ? ICON.STOP[this.player.isPlaying] : ICON.STOP.true}></ha-icon>
        </ha-icon-button>
      ` : html``}
    `;
  }

  renderJumpForwardButton() {
    const hidden = this.config.hide.jump;
    if (hidden || !this.player.hasProgress) return html``;
    return html`<ha-icon-button @click=${e => this.player.jump(e, this.jumpAmount)} .icon=${ICON.FAST_FORWARD}>
      <ha-icon .icon=${ICON.FAST_FORWARD}></ha-icon>
    </ha-icon-button>`;
  }

  renderJumpBackwardButton() {
    const hidden = this.config.hide.jump;
    if (hidden || !this.player.hasProgress) return html``;
    return html`<ha-icon-button @click=${e => this.player.jump(e, -this.jumpAmount)} .icon=${ICON.REWIND}>
      <ha-icon .icon=${ICON.REWIND}></ha-icon>
    </ha-icon-button>`;
  }

  handleStop(e) {
    return this.config.hide.play_pause ? this.player.playStop(e) : this.player.stop(e);
  }

  handleVolumeChange(ev) {
    const vol = parseFloat(ev.target.value) / 100;
    this.player.setVolume(ev, vol);
  }

static get styles() {
    return [
      sharedStyle,
      css`
        :host {
          display: flex;
          width: 100%;
          justify-content: space-between;
        }
        .flex {
          display: flex;
          flex: 1;
          justify-content: space-between;
        }

        .volume-bars-container {
          position: relative;
          display: flex;
          align-items: center;
          height: 50px;
          gap: 4px;
          padding: 0 8px;
          cursor: pointer;
          justify-content: flex-start;
          box-sizing: border-box;
          /* Ширина будет устанавливаться динамически через JS */
        }

        .volume-bars-container[disabled] {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .volume-bar {
          width: 8px;
          height: 36px;
          border-radius: 3px;
          flex: none;
          transition: background-color 0.2s ease, opacity 0.2s ease;
        }

        .volume-bar.active {
          background-color: var(--primary-color, #6200ee);
        }

        .volume-bar.inactive {
          background-color: var(--primary-color, #6200ee);
          opacity: 0.25;
        }

        .volume-bar.muted {
          opacity: 0.1 !important;
        }

        .invisible-slider {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          opacity: 0;
          cursor: pointer;
        }

        ha-icon-button {
          min-width: var(--mmp-unit);
        }

        .mmp-media-controls__volume {
          flex: 100;
          max-height: var(--mmp-unit);
          align-items: center;
          position: relative;
        }

        .mmp-media-controls__volume.--buttons {
          justify-content: left;
        }

        .mmp-media-controls__media {
          margin-right: 0;
          margin-left: auto;
          justify-content: inherit;
        }

        .mmp-media-controls__media[flow] {
          max-width: none;
          justify-content: space-between;
        }

        .mmp-media-controls__shuffle,
        .mmp-media-controls__repeat {
          flex: 3;
          flex-shrink: 200;
          justify-content: center;
        }
      `,
    ];
  }
}

if (!customElements.get('mmp-media-controls')) {
  customElements.define('mmp-media-controls', MiniMediaPlayerMediaControls);
}
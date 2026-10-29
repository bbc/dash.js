import VideoModel from '../../../../src/streaming/models/VideoModel.js';
import VideoElementMock from '../../mocks/VideoElementMock.js';
import Settings from '../../../../src/core/Settings.js';
import Constants from '../../../../src/streaming/constants/Constants.js';
import EventBus from '../../../../src/core/EventBus.js';
import Events from '../../../../src/core/events/Events.js';

import {expect} from 'chai';

describe('VideoModel', () => {
    const context = {};
    const videoModel = VideoModel(context).getInstance();
    const videoElementMock = new VideoElementMock();
    const settings = Settings(context).getInstance();

    beforeEach(() => {
        videoModel.setElement(videoElementMock);
    });

    afterEach(() => {
        videoModel.reset();
        videoElementMock.reset();
        settings.reset();
    });

    describe('setPlaybackRate()', () => {
        it('Should always set playback rate even when not in ready state if ignoring ready state', () => {
            videoElementMock.playbackRate = 1;
            videoElementMock.readyState = Constants.VIDEO_ELEMENT_READY_STATES.HAVE_NOTHING;

            videoModel.setPlaybackRate(0, true);
            expect(videoElementMock.playbackRate).to.equal(0);
        });

        it('Should set playback rate if the video element is in ready state', () => {
            videoElementMock.playbackRate = 1;
            videoElementMock.readyState = Constants.VIDEO_ELEMENT_READY_STATES.HAVE_FUTURE_DATA;
            
            videoModel.setPlaybackRate(0.5, false);
            expect(videoElementMock.playbackRate).to.equal(0.5);
        });
    });

    describe('setStallState()', () => {        
        describe('syntheticStallEvents enabled', () => {            
            beforeEach(() => {
                settings.update({ streaming: { buffer: { syntheticStallEvents: { enabled: true, ignoreReadyState: false } }}});
                videoModel.setConfig({ settings });
            })

            it('Should set playback rate to 0 on stall if video element is in ready state', () => {
                videoElementMock.playbackRate = 1;
                videoElementMock.readyState = Constants.VIDEO_ELEMENT_READY_STATES.HAVE_FUTURE_DATA;

                videoModel.setStallState('video', true);

                expect(videoElementMock.playbackRate).to.equal(0);
            });

            it('Should emit a waiting event on stall if video element is in ready state', (done) => {
                videoElementMock.readyState = Constants.VIDEO_ELEMENT_READY_STATES.HAVE_FUTURE_DATA;

                const onWaiting = () => {
                    videoElementMock.removeEventListener('waiting', onWaiting);
                    done();
                };
                videoElementMock.addEventListener('waiting', onWaiting);

                videoModel.setStallState('video', true);
            });

            it('Should emit a playing event on stall end even if not in ready state if ignoring ready state', (done) => {
                settings.update({ streaming: { buffer: { syntheticStallEvents: { enabled: true, ignoreReadyState: true } }}});
                
                videoElementMock.readyState = Constants.VIDEO_ELEMENT_READY_STATES.HAVE_NOTHING;

                const onPlaying = () => {
                    videoElementMock.removeEventListener('playing', onPlaying);
                    done();
                }
                videoElementMock.addEventListener('playing', onPlaying);

                videoModel.setStallState('video', false);
            });

            it('Should emit a playing event on stall end if video element is in ready state', (done) => {
                videoElementMock.readyState = Constants.VIDEO_ELEMENT_READY_STATES.HAVE_FUTURE_DATA;

                const onPlaying = () => {
                    videoElementMock.removeEventListener('playing', onPlaying);
                    done();
                }
                videoElementMock.addEventListener('playing', onPlaying);

                videoModel.setStallState('video', false);
            });

            it('Should clear a stalled stream and restore playback rate', () => {
                videoElementMock.playbackRate = 1;
                videoElementMock.readyState = Constants.VIDEO_ELEMENT_READY_STATES.HAVE_FUTURE_DATA;

                videoModel.setStallState('video', true);
                videoModel.clearStallState();

                expect(videoModel.isStalled()).to.equal(false);
                expect(videoElementMock.playbackRate).to.equal(1);
            });
        });

        describe('playback rate protection with ignoreReadyState', () => {
            beforeEach(() => {
                settings.update({ streaming: { buffer: { syntheticStallEvents: { enabled: true, ignoreReadyState: true } } } });
                videoModel.setConfig({ settings });
                videoElementMock.playbackRate = 1;
                videoElementMock.readyState = Constants.VIDEO_ELEMENT_READY_STATES.HAVE_NOTHING;
            });

            it('Should defer internally generated rate changes during a synthetic stall', () => {
                videoModel.setStallState('video', true);
                videoModel.setStallState('audio', true);
                videoModel.setPlaybackRate(1.5, true);

                expect(videoElementMock.playbackRate).to.equal(0);
                expect(videoModel.isStalled()).to.equal(true);
            });

            it('Should clear the stall and keep an external rate change', () => {
                let waitingEvents = 0;
                let playingEvents = 0;
                videoElementMock.addEventListener('waiting', () => waitingEvents++);
                videoElementMock.addEventListener('playing', () => playingEvents++);
                videoModel.setStallState('video', true);

                videoElementMock.playbackRate = 1.5;
                videoElementMock.dispatchEvent(new Event('ratechange'));
                expect(videoElementMock.playbackRate).to.equal(1.5);
                expect(videoModel.isStalled()).to.equal(false);
                expect(waitingEvents).to.equal(1);
                expect(playingEvents).to.equal(1);
            });

            it('Should retain the latest rate when clearing the stall state', () => {
                videoModel.setStallState('video', true);
                videoModel.setPlaybackRate(1.5);
                videoModel.clearStallState();

                expect(videoModel.isStalled()).to.equal(false);
                expect(videoElementMock.playbackRate).to.equal(1.5);
            });

            it('Should clear the stall when playing is reported before ratechange', () => {
                videoModel.initialize();
                videoModel.setStallState('video', true);
                videoElementMock.playbackRate = 1.5;
                let waitingEvents = 0;
                videoElementMock.addEventListener('waiting', () => waitingEvents++);

                EventBus(context).getInstance().trigger(Events.PLAYBACK_PLAYING);

                expect(videoElementMock.playbackRate).to.equal(1.5);
                expect(videoModel.isStalled()).to.equal(false);
                expect(waitingEvents).to.equal(0);
                expect(videoElementMock.playbackRate).to.equal(1.5);
            });

            it('Should not emit playing on recovery while paused', () => {
                const element = new VideoElementMock();
                element.playbackRate = 1;
                element.paused = true;
                videoModel.setElement(element);
                let playingEvents = 0;
                element.addEventListener('playing', () => playingEvents++);
                videoModel.setStallState('video', true);
                videoModel.setPlaybackRate(1.5);
                videoModel.setStallState('video', false);

                expect(element.playbackRate).to.equal(1.5);
                expect(playingEvents).to.equal(0);
            });

            ['remove', 'clear'].forEach((action) => {
                it(`Should retain an external change before ratechange fires on ${action}`, () => {
                    videoModel.setStallState('video', true);
                    videoElementMock.playbackRate = 2;

                    if (action === 'clear') {
                        videoModel.clearStallState();
                    } else {
                        videoModel.setStallState('video', false);
                    }
                    expect(videoElementMock.playbackRate).to.equal(2);
                    videoElementMock.dispatchEvent(new Event('ratechange'));
                    expect(videoElementMock.playbackRate).to.equal(2);
                });
            });

            it('Should not overwrite the requested rate when setting the source during a stall', () => {
                videoModel.setStallState('video', true);
                videoModel.setPlaybackRate(1.5);
                videoModel.setSource('test.mpd');
                videoModel.clearStallState();

                expect(videoElementMock.playbackRate).to.equal(1.5);
            });

            it('Should release synthetic stall protection and remove its listener on reset', () => {
                videoModel.setStallState('video', true);
                videoModel.setPlaybackRate(1.5);
                videoModel.reset();

                expect(videoElementMock.playbackRate).to.equal(1.5);
                expect(videoElementMock.events.ratechange).to.have.lengthOf(0);
                videoElementMock.playbackRate = 2;
                videoElementMock.dispatchEvent(new Event('ratechange'));
                expect(videoElementMock.playbackRate).to.equal(2);
            });

            it('Should release synthetic stall protection when replacing the element', () => {
                videoModel.setStallState('video', true);
                videoModel.setPlaybackRate(1.5);
                const replacement = new VideoElementMock();
                replacement.playbackRate = 2;
                videoModel.setElement(replacement);

                expect(videoElementMock.playbackRate).to.equal(1.5);
                expect(videoElementMock.events.ratechange).to.have.lengthOf(0);
                expect(videoModel.isStalled()).to.equal(false);
                expect(replacement.playbackRate).to.equal(2);
            });

            it('Should leave external rate changes alone when synthetic stalls are disabled', () => {
                settings.update({ streaming: { buffer: { syntheticStallEvents: { enabled: false } } } });
                videoModel.setStallState('video', true);
                videoElementMock.playbackRate = 1.5;
                videoElementMock.dispatchEvent(new Event('ratechange'));
                videoModel.setStallState('video', false);

                expect(videoElementMock.playbackRate).to.equal(1.5);
            });

            it('Should clear a ready-state-dependent stall on an external rate change', () => {
                settings.update({ streaming: { buffer: { syntheticStallEvents: { ignoreReadyState: false } } } });
                videoElementMock.readyState = Constants.VIDEO_ELEMENT_READY_STATES.HAVE_FUTURE_DATA;
                videoModel.setStallState('video', true);
                videoElementMock.playbackRate = 1.5;
                videoElementMock.dispatchEvent(new Event('ratechange'));

                expect(videoElementMock.playbackRate).to.equal(1.5);
                expect(videoModel.isStalled()).to.equal(false);
            });

            it('Should clear the stall on native asynchronous ratechange events and retain native validation', async () => {
                const element = document.createElement('video');
                element.playbackRate = 1;
                videoModel.setElement(element);
                videoModel.setStallState('video', true);

                expect(element.playbackRate).to.equal(0);

                const rateChanged = new Promise((resolve) => {
                    element.addEventListener('ratechange', resolve, { once: true });
                });
                element.playbackRate = 1.5;
                await rateChanged;

                expect(element.playbackRate).to.equal(1.5);
                expect(videoModel.isStalled()).to.equal(false);
                expect(element.playbackRate).to.equal(1.5);
            });
        });
    });
});
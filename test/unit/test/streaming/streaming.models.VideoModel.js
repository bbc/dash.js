import VideoModel from '../../../../src/streaming/models/VideoModel.js';
import VideoElementMock from '../../mocks/VideoElementMock.js';
import Settings from '../../../../src/core/Settings.js';
import Constants from '../../../../src/streaming/constants/Constants.js';

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

    describe('setCurrentTime()', () => {
        describe('seekWithoutReadyStateCheck disabled (default)', () => {
            it('Should not set currentTime immediately when readyState is below HAVE_METADATA', () => {
                videoElementMock.currentTime = 0;
                videoElementMock.readyState = Constants.VIDEO_ELEMENT_READY_STATES.HAVE_NOTHING;

                videoModel.setCurrentTime(10, false);

                // readyState too low — time must not have been applied yet
                expect(videoElementMock.currentTime).to.equal(0);
            });

            it('Should set currentTime synchronously when readyState is already HAVE_METADATA or above', () => {
                videoElementMock.currentTime = 0;
                videoElementMock.readyState = Constants.VIDEO_ELEMENT_READY_STATES.HAVE_METADATA;

                videoModel.setCurrentTime(10, false);

                expect(videoElementMock.currentTime).to.equal(10);
            });

            it('Should apply a deferred seek once the loadedmetadata event fires', () => {
                videoElementMock.currentTime = 0;
                videoElementMock.readyState = Constants.VIDEO_ELEMENT_READY_STATES.HAVE_NOTHING;

                videoModel.setCurrentTime(20, false);
                expect(videoElementMock.currentTime).to.equal(0);

                // Simulate readyState reaching HAVE_METADATA and firing the event
                videoElementMock.readyState = Constants.VIDEO_ELEMENT_READY_STATES.HAVE_METADATA;
                videoElementMock.dispatchEvent({ type: 'loadedmetadata' });

                expect(videoElementMock.currentTime).to.equal(20);
            });

            it('Should cancel a pending deferred seek when setCurrentTime is called a second time', () => {
                videoElementMock.currentTime = 0;
                videoElementMock.readyState = Constants.VIDEO_ELEMENT_READY_STATES.HAVE_NOTHING;

                // First seek — deferred
                videoModel.setCurrentTime(20, false);
                // Second seek before the event fires — should supersede the first
                videoModel.setCurrentTime(30, false);

                videoElementMock.readyState = Constants.VIDEO_ELEMENT_READY_STATES.HAVE_METADATA;
                videoElementMock.dispatchEvent({ type: 'loadedmetadata' });

                expect(videoElementMock.currentTime).to.equal(30);
            });
        });

        describe('seekWithoutReadyStateCheck enabled', () => {
            beforeEach(() => {
                settings.update({ streaming: { seekWithoutReadyStateCheck: true } });
                videoModel.setConfig({ settings });
            });

            it('Should set currentTime immediately regardless of readyState', () => {
                videoElementMock.currentTime = 0;
                videoElementMock.readyState = Constants.VIDEO_ELEMENT_READY_STATES.HAVE_NOTHING;

                videoModel.setCurrentTime(15, false);

                expect(videoElementMock.currentTime).to.equal(15);
            });

            it('Should not register a loadedmetadata listener when bypassing readyState check', () => {
                videoElementMock.currentTime = 0;
                videoElementMock.readyState = Constants.VIDEO_ELEMENT_READY_STATES.HAVE_NOTHING;

                videoModel.setCurrentTime(15, false);

                // Firing the event after the seek should not re-apply or change currentTime
                videoElementMock.currentTime = 0;
                videoElementMock.dispatchEvent({ type: 'loadedmetadata' });

                expect(videoElementMock.currentTime).to.equal(0);
            });
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
        });
    });
});
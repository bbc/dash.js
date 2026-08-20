import Settings from '../../../../src/core/Settings.js';
import ScheduleController from '../../../../src/streaming/controllers/ScheduleController.js';
import EventBus from '../../../../src/core/EventBus.js';
import Events from '../../../../src/core/events/Events.js';
import Errors from '../../../../src/core/errors/Errors.js';
import VoHelper from '../../helpers/VOHelper.js';
import Constants from '../../../../src/streaming/constants/Constants.js';
import MediaPlayerEvents from '../../../../src/streaming/MediaPlayerEvents.js';
import {HTTPRequest} from '../../../../src/streaming/vo/metrics/HTTPRequest.js';
import AdapterMock from '../../mocks/AdapterMock.js';
import DashMetricsMock from '../../mocks/DashMetricsMock.js';
import AbrControllerMock from '../../mocks/AbrControllerMock.js';
import MediaPlayerModelMock from '../../mocks/MediaPlayerModelMock.js';
import PlaybackControllerMock from '../../mocks/PlaybackControllerMock.js';
import TextControllerMock from '../../mocks/TextControllerMock.js';
import RepresentationControllerMock from '../../mocks/RepresentationControllerMock.js';

const voHelper = new VoHelper();
import {expect} from 'chai';
const context = {};
const settings = Settings(context).getInstance();
const eventBus = EventBus(context).getInstance();

let scheduleController;
let streamInfo, adapter, dashMetrics, abrController, mediaPlayerModel, textController, representationController;

function createBufferedRanges(ranges) {
    return {
        length: ranges.length,
        start: (index) => ranges[index].start,
        end: (index) => ranges[index].end
    };
}

describe('ScheduleController', function () {

    afterEach(() => {
        settings.reset();
        if (scheduleController) {
            scheduleController.reset();
        }
    });

    describe('getBufferTarget()', () => {

        beforeEach(() => {
            streamInfo = voHelper.getDummyStreamInfo();
            adapter = new AdapterMock();
            dashMetrics = new DashMetricsMock();
            abrController = new AbrControllerMock();
            mediaPlayerModel = new MediaPlayerModelMock();
            textController = new TextControllerMock();
            representationController = new RepresentationControllerMock();
        })

        describe('for missing values', () => {

            it('should return NaN if type is undefined', () => {
                scheduleController = ScheduleController(context).create({
                    streamInfo,
                    adapter,
                    dashMetrics,
                    abrController,
                    mediaPlayerModel,
                    textController,
                    representationController,
                    settings
                });
                const result = scheduleController.getBufferTarget();
                expect(result).to.be.NaN;
            });

            it('should return NaN if voRepresentation is undefined', () => {
                representationController.getCurrentRepresentation = function () {
                    return undefined
                }
                scheduleController = ScheduleController(context).create({
                    streamInfo,
                    adapter,
                    type: Constants.VIDEO,
                    dashMetrics,
                    abrController,
                    mediaPlayerModel,
                    representationController,
                    settings
                });
                const result = scheduleController.getBufferTarget();
                expect(result).to.be.NaN;
            });
        })

        describe('for type audio', () => {

            beforeEach(() => {
                scheduleController = ScheduleController(context).create({
                    streamInfo,
                    adapter,
                    type: Constants.AUDIO,
                    dashMetrics,
                    abrController,
                    mediaPlayerModel,
                    representationController,
                    settings
                });
            })

            it('should return 16 (value returns by getCurrentBufferLevel of DashMetricsMock + 1) if current representation is audio and videoTrackPresent is true', () => {
                representationController.getCurrentRepresentation = function () {
                    return {}
                }
                scheduleController.initialize(true);
                const result = scheduleController.getBufferTarget();
                expect(result).to.be.equal(16);
            });

            it('should return 12 (DEFAULT_MIN_BUFFER_TIME of MediaPlayerModelMock) if current representation is audio and videoTrackPresent is false', () => {
                scheduleController.initialize(false);
                representationController.getCurrentRepresentation = function () {
                    return { mediaInfo: { streamInfo: streamInfo } }
                }
                const result = scheduleController.getBufferTarget();
                expect(result).to.be.equal(12);
            });

            it('should return bufferTimeAtTopQuality if current representation is audio and videoTrackPresent is false and playing on highest quality', () => {
                scheduleController.initialize(false);
                abrController.isPlayingAtTopQuality = () => true;
                streamInfo.manifestInfo = { duration: 10 };
                representationController.getCurrentRepresentation = function () {
                    return { mediaInfo: { streamInfo: streamInfo } }
                }
                const result = scheduleController.getBufferTarget();
                expect(result).to.be.equal(settings.get().streaming.buffer.bufferTimeAtTopQuality);
            });

            it('should return bufferTimeAtTopQualityLongForm if current representation is audio and videoTrackPresent is false and playing on highest quality for long form content', () => {
                scheduleController.initialize(false);
                abrController.isPlayingAtTopQuality = () => true;
                streamInfo.manifestInfo = { duration: Infinity };
                representationController.getCurrentRepresentation = function () {
                    return { mediaInfo: { streamInfo: streamInfo } }
                }
                const result = scheduleController.getBufferTarget();
                expect(result).to.be.equal(settings.get().streaming.buffer.bufferTimeAtTopQualityLongForm);
            });
        })

        describe('for type video', () => {

            beforeEach(() => {
                scheduleController = ScheduleController(context).create({
                    streamInfo,
                    adapter,
                    type: Constants.VIDEO,
                    dashMetrics,
                    abrController,
                    mediaPlayerModel,
                    representationController,
                    settings
                });
            })

            it('should return 15 (value returns by getCurrentBufferLevel of DashMetricsMock) if current representation is video', () => {
                scheduleController.initialize(true);
                representationController.getCurrentRepresentation = function () {
                    return { mediaInfo: { streamInfo: streamInfo } }
                }
                const result = scheduleController.getBufferTarget();
                expect(result).to.be.equal(mediaPlayerModel.getBufferTimeDefault());
            });

            it('should return bufferTimeAtTopQuality if current representation is video and playing on highest quality', () => {
                scheduleController.initialize(false);
                abrController.isPlayingAtTopQuality = () => true;
                streamInfo.manifestInfo = { duration: 10 };
                representationController.getCurrentRepresentation = function () {
                    return { mediaInfo: { streamInfo: streamInfo } }
                }
                const result = scheduleController.getBufferTarget();
                expect(result).to.be.equal(settings.get().streaming.buffer.bufferTimeAtTopQuality);
            });

            it('should return bufferTimeAtTopQualityLongForm if current representation is video and playing on highest quality for long form content', () => {
                scheduleController.initialize(false);
                abrController.isPlayingAtTopQuality = () => true;
                streamInfo.manifestInfo = { duration: Infinity };
                representationController.getCurrentRepresentation = function () {
                    return { mediaInfo: { streamInfo: streamInfo } }
                }
                const result = scheduleController.getBufferTarget();
                expect(result).to.be.equal(settings.get().streaming.buffer.bufferTimeAtTopQualityLongForm);
            });

        });

        describe('for type text', () => {

            beforeEach(() => {
                scheduleController = ScheduleController(context).create({
                    streamInfo,
                    adapter,
                    type: Constants.TEXT,
                    dashMetrics,
                    abrController,
                    mediaPlayerModel,
                    textController,
                    representationController,
                    settings
                });
            })

            it('should return 0 if current representation is text, and subtitles are disabled', function () {
                representationController.getCurrentRepresentation = function () {
                    return {}
                }
                const result = scheduleController.getBufferTarget();
                expect(result).to.be.equal(0);
            });

            it('should return 6 (value returns by voRepresentation.fragmentDuration) if current representation is text, and subtitles are enabled', function () {
                textController.enableText(true);
                representationController.getCurrentRepresentation = function () {
                    return {fragmentDuration: 6}
                }
                const result = scheduleController.getBufferTarget();
                expect(result).to.be.equal(6);
            });
        })

    })

    describe('nonEffectiveDownloadLimit', () => {
        let playbackController;
        let errors;
        let errorListener;

        beforeEach(() => {
            streamInfo = voHelper.getDummyStreamInfo();
            adapter = new AdapterMock();
            dashMetrics = new DashMetricsMock();
            abrController = new AbrControllerMock();
            mediaPlayerModel = new MediaPlayerModelMock();
            playbackController = new PlaybackControllerMock();
            representationController = new RepresentationControllerMock();
            errors = [];

            scheduleController = ScheduleController(context).create({
                abrController,
                adapter,
                dashMetrics,
                errHandler: {
                    error: (error) => eventBus.trigger(MediaPlayerEvents.ERROR, {error})
                },
                mediaPlayerModel,
                playbackController,
                representationController,
                settings,
                streamInfo,
                type: Constants.VIDEO
            });
            scheduleController.initialize(true);
            errorListener = (event) => errors.push(event.error);
            eventBus.on(MediaPlayerEvents.ERROR, errorListener);
        });

        afterEach(() => {
            eventBus.off(MediaPlayerEvents.ERROR, errorListener);
        });

        function triggerMediaAppend(bufferedRanges) {
            eventBus.trigger(Events.BYTES_APPENDED_END_FRAGMENT, {
                bufferedRanges,
                segmentType: HTTPRequest.MEDIA_SEGMENT_TYPE
            }, {
                mediaType: Constants.VIDEO,
                streamId: streamInfo.id
            });
        }

        it('should not report an error when the limit is zero or negative', () => {
            playbackController.setTime(7);
            const ranges = createBufferedRanges([{start: 0, end: 10}, {start: 14, end: 130}]);

            triggerMediaAppend(ranges);
            triggerMediaAppend(ranges);
            settings.update({streaming: {scheduling: {nonEffectiveDownloadLimit: -1}}});
            triggerMediaAppend(ranges);

            expect(errors).to.be.empty;
        });

        it('should report the current TimeRanges when the limit is reached', () => {
            settings.update({streaming: {scheduling: {nonEffectiveDownloadLimit: 2}}});
            playbackController.setTime(7);
            const initialRanges = createBufferedRanges([{start: 0, end: 10}, {start: 14, end: 20}]);
            const firstNonEffectiveRanges = createBufferedRanges([{start: 0, end: 10}, {start: 14, end: 30}]);
            const limitReachedRanges = createBufferedRanges([{start: 0, end: 10}, {start: 14, end: 40}]);

            triggerMediaAppend(initialRanges);
            triggerMediaAppend(firstNonEffectiveRanges);
            triggerMediaAppend(limitReachedRanges);
            triggerMediaAppend(limitReachedRanges);

            expect(errors).to.have.lengthOf(1);
            expect(errors[0].code).to.equal(Errors.NON_EFFECTIVE_DOWNLOAD_ERROR_CODE);
            expect(errors[0].data.bufferedRanges).to.equal(limitReachedRanges);
            expect(errors[0].data.playbackTime).to.equal(7);
            expect(errors[0].data.limit).to.equal(2);
            expect(errors[0].data.nonEffectiveSegmentDownloadCount).to.equal(2);
        });

        it('should reset the counter when the range at the playback position expands', () => {
            settings.update({streaming: {scheduling: {nonEffectiveDownloadLimit: 2}}});
            playbackController.setTime(7);

            triggerMediaAppend(createBufferedRanges([{start: 0, end: 10}, {start: 14, end: 20}]));
            triggerMediaAppend(createBufferedRanges([{start: 0, end: 10}, {start: 14, end: 30}]));
            triggerMediaAppend(createBufferedRanges([{start: 0, end: 15}, {start: 16, end: 30}]));
            triggerMediaAppend(createBufferedRanges([{start: 0, end: 15}, {start: 16, end: 40}]));

            expect(errors).to.be.empty;
        });
    });
});

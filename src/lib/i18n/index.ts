/**
 * Internationalization system using Svelte 5 runes
 */

export type Language = 'en' | 'es';

export interface Translations {
	// App
	appTitle: string;
	appDescription: string;
	appIntro: string;

	// Language selector
	languageLabel: string;

	// Recording controls
	includeMicrophone: string;
	microphoneHint: string;
	microphoneLabel: string;
	startRecording: string;
	stopRecording: string;
	tryAgain: string;

	// Recording in progress
	recording: string;
	duration: string;
	recordingDuration: string;

	// Post-processing
	postProcessingOptions: string;
	outputFormat: string;
	mp3: string;
	mp3Desc: string;
	aac: string;
	aacDesc: string;
	opus: string;
	opusDesc: string;
	duckSystemAudio: string;
	duckHint: string;
	processAudio: string;
	startOver: string;

	// Downloads
	downloadsReady: string;
	downloadSystemAudio: string;
	downloadMicrophone: string;
	downloadMixedTrack: string;
	recordAnother: string;

	// Processing
	processingAudio: string;
	processingHint: string;

	// Status messages
	recordingStarted: string;
	recordingStopped: string;
	processingFiles: string;
	downloadsReadyStatus: string;

	// Errors
	failedToStartRecording: string;

	// Recording history
	recentRecordings: string;
	noRecordingsYet: string;
	expired: string;
	expiresToday: string;
	expiresTomorrow: string;
	expiresInDays: (days: number) => string;
	microphone: string;
	systemAudio: string;
	mixed: string;
	play: string;
	pause: string;
	download: string;
	delete: string;
	deleting: string;
	previewPaused: string;
	previewEnded: string;
	previewFailed: string;
	playingPreview: string;
	failedToPlayPreview: string;
	recordingDeleted: string;
	failedToDeleteRecording: string;

	// Aria labels
	recordingOptions: string;
	recordingInProgress: string;
	downloadOptions: string;
	availableTracks: string;
	deleteRecordingFrom: (date: string) => string;
	playPreview: (track: string) => string;
	pausePreview: (track: string) => string;
	downloadTrack: (track: string) => string;
}

const translations: Record<Language, Translations> = {
	en: {
		// App
		appTitle: 'Audio Recorder',
		appDescription: 'High-quality screen and microphone audio recorder',
		appIntro: 'Record high-quality audio from your screen or browser tab, with optional microphone mixing.',

		// Language selector
		languageLabel: 'Language',

		// Recording controls
		includeMicrophone: 'Include microphone',
		microphoneHint: 'Enable to record your voice along with system audio',
		microphoneLabel: 'Microphone:',
		startRecording: 'Start Recording',
		stopRecording: 'Stop Recording',
		tryAgain: 'Try again',

		// Recording in progress
		recording: 'Recording',
		duration: 'Duration:',
		recordingDuration: 'Recording duration',

		// Post-processing
		postProcessingOptions: 'Post-Processing Options',
		outputFormat: 'Output format',
		mp3: 'MP3',
		mp3Desc: 'universal compatibility',
		aac: 'AAC',
		aacDesc: 'better quality/size ratio',
		opus: 'Opus/WebM',
		opusDesc: 'best quality, limited compatibility',
		duckSystemAudio: 'Duck system audio while speaking',
		duckHint: 'Automatically lower system audio volume when your microphone detects speech',
		processAudio: 'Process Audio',
		startOver: 'Start Over',

		// Downloads
		downloadsReady: 'Downloads Ready',
		downloadSystemAudio: 'Download System Audio',
		downloadMicrophone: 'Download Microphone',
		downloadMixedTrack: 'Download Mixed Track',
		recordAnother: 'Record Another',

		// Processing
		processingAudio: 'Processing audio files...',
		processingHint: 'This may take a moment for longer recordings.',

		// Status messages
		recordingStarted: 'Recording started',
		recordingStopped: 'Recording stopped. Configure post-processing options.',
		processingFiles: 'Processing audio files...',
		downloadsReadyStatus: 'Downloads ready',

		// Errors
		failedToStartRecording: 'Failed to start recording. Please try again.',

		// Recording history
		recentRecordings: 'Recent Recordings',
		noRecordingsYet: 'No recordings yet. Start by recording above.',
		expired: 'Expired',
		expiresToday: 'Expires today',
		expiresTomorrow: 'Expires tomorrow',
		expiresInDays: (days: number) => `Expires in ${days} days`,
		microphone: 'Microphone',
		systemAudio: 'System Audio',
		mixed: 'Mixed',
		play: 'Play',
		pause: 'Pause',
		download: 'Download',
		delete: 'Delete',
		deleting: 'Deleting...',
		previewPaused: 'Preview paused',
		previewEnded: 'Preview ended',
		previewFailed: 'Preview failed to load',
		playingPreview: 'Playing preview',
		failedToPlayPreview: 'Failed to play preview',
		recordingDeleted: 'Recording deleted',
		failedToDeleteRecording: 'Failed to delete recording',

		// Aria labels
		recordingOptions: 'Recording options',
		recordingInProgress: 'Recording in progress',
		downloadOptions: 'Download options',
		availableTracks: 'Available tracks',
		deleteRecordingFrom: (date: string) => `Delete recording from ${date}`,
		playPreview: (track: string) => `Play ${track} preview`,
		pausePreview: (track: string) => `Pause ${track} preview`,
		downloadTrack: (track: string) => `Download ${track}`
	},
	es: {
		// App
		appTitle: 'Grabadora de Audio',
		appDescription: 'Grabadora de audio de alta calidad para pantalla y micrófono',
		appIntro: 'Graba audio de alta calidad desde tu pantalla o pestaña del navegador, con mezcla opcional de micrófono.',

		// Language selector
		languageLabel: 'Idioma',

		// Recording controls
		includeMicrophone: 'Incluir micrófono',
		microphoneHint: 'Activa para grabar tu voz junto con el audio del sistema',
		microphoneLabel: 'Micrófono:',
		startRecording: 'Iniciar Grabación',
		stopRecording: 'Detener Grabación',
		tryAgain: 'Intentar de nuevo',

		// Recording in progress
		recording: 'Grabando',
		duration: 'Duración:',
		recordingDuration: 'Duración de la grabación',

		// Post-processing
		postProcessingOptions: 'Opciones de Postprocesamiento',
		outputFormat: 'Formato de salida',
		mp3: 'MP3',
		mp3Desc: 'compatibilidad universal',
		aac: 'AAC',
		aacDesc: 'mejor relación calidad/tamaño',
		opus: 'Opus/WebM',
		opusDesc: 'mejor calidad, compatibilidad limitada',
		duckSystemAudio: 'Reducir audio del sistema al hablar',
		duckHint: 'Reduce automáticamente el volumen del sistema cuando tu micrófono detecta voz',
		processAudio: 'Procesar Audio',
		startOver: 'Empezar de Nuevo',

		// Downloads
		downloadsReady: 'Descargas Listas',
		downloadSystemAudio: 'Descargar Audio del Sistema',
		downloadMicrophone: 'Descargar Micrófono',
		downloadMixedTrack: 'Descargar Pista Mezclada',
		recordAnother: 'Grabar Otra',

		// Processing
		processingAudio: 'Procesando archivos de audio...',
		processingHint: 'Esto puede tardar un momento para grabaciones más largas.',

		// Status messages
		recordingStarted: 'Grabación iniciada',
		recordingStopped: 'Grabación detenida. Configura las opciones de postprocesamiento.',
		processingFiles: 'Procesando archivos de audio...',
		downloadsReadyStatus: 'Descargas listas',

		// Errors
		failedToStartRecording: 'Error al iniciar la grabación. Por favor, inténtalo de nuevo.',

		// Recording history
		recentRecordings: 'Grabaciones Recientes',
		noRecordingsYet: 'Aún no hay grabaciones. Comienza grabando arriba.',
		expired: 'Expirado',
		expiresToday: 'Expira hoy',
		expiresTomorrow: 'Expira mañana',
		expiresInDays: (days: number) => `Expira en ${days} días`,
		microphone: 'Micrófono',
		systemAudio: 'Audio del Sistema',
		mixed: 'Mezclado',
		play: 'Reproducir',
		pause: 'Pausar',
		download: 'Descargar',
		delete: 'Eliminar',
		deleting: 'Eliminando...',
		previewPaused: 'Vista previa pausada',
		previewEnded: 'Vista previa terminada',
		previewFailed: 'Error al cargar la vista previa',
		playingPreview: 'Reproduciendo vista previa',
		failedToPlayPreview: 'Error al reproducir la vista previa',
		recordingDeleted: 'Grabación eliminada',
		failedToDeleteRecording: 'Error al eliminar la grabación',

		// Aria labels
		recordingOptions: 'Opciones de grabación',
		recordingInProgress: 'Grabación en progreso',
		downloadOptions: 'Opciones de descarga',
		availableTracks: 'Pistas disponibles',
		deleteRecordingFrom: (date: string) => `Eliminar grabación del ${date}`,
		playPreview: (track: string) => `Reproducir vista previa de ${track}`,
		pausePreview: (track: string) => `Pausar vista previa de ${track}`,
		downloadTrack: (track: string) => `Descargar ${track}`
	}
};

const STORAGE_KEY = 'app-language';

// Detect browser language
function detectBrowserLanguage(): Language {
	if (typeof navigator === 'undefined') return 'en';

	const browserLang = navigator.language || (navigator as { userLanguage?: string }).userLanguage || '';
	const langCode = browserLang.split('-')[0].toLowerCase();

	if (langCode === 'es') {
		return 'es';
	}
	return 'en';
}

// Get saved language from localStorage
function getSavedLanguage(): Language | null {
	if (typeof localStorage === 'undefined') return null;

	const saved = localStorage.getItem(STORAGE_KEY);
	if (saved === 'en' || saved === 'es') {
		return saved;
	}
	return null;
}

// Save language to localStorage
function saveLanguage(lang: Language) {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(STORAGE_KEY, lang);
}

// Global state
let currentLanguage = $state<Language>('en');
let initialized = false;

export function initializeLanguage() {
	if (initialized) return;
	initialized = true;

	// Check localStorage first, then fall back to browser detection
	const saved = getSavedLanguage();
	currentLanguage = saved ?? detectBrowserLanguage();
}

export function getLanguageState() {
	return {
		get language() {
			return currentLanguage;
		},
		set language(value: Language) {
			currentLanguage = value;
			saveLanguage(value);
		},
		get t() {
			return translations[currentLanguage];
		},
		get languages(): { code: Language; name: string }[] {
			return [
				{ code: 'en', name: 'English' },
				{ code: 'es', name: 'Español' }
			];
		}
	};
}

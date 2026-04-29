import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Question, QuestionType, QuizState, QuizLevel, Profile } from './types';
import { generateQuestions, evaluateAllEssayAnswers, generateSpeech } from './services/geminiService';
import { 
  BookOpen, 
  CheckCircle2, 
  ChevronRight, 
  History, 
  PlusCircle, 
  Save, 
  RefreshCw, 
  Trash2,
  AlertCircle,
  HelpCircle,
  Award,
  BookMarked,
  Settings,
  X,
  ChevronUp,
  ChevronDown,
  Calendar,
  Map,
  MapPin,
  ListChecks,
  CheckSquare,
  AlignLeft,
  AlignJustify,
  Heart,
  Users,
  Database,
  Volume2,
  VolumeX
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import confetti from 'canvas-confetti';
import { FirebaseTest } from './components/FirebaseTest';
import { IDB } from './services/idbStore';
import { auth, loginWithGoogle, logout, syncToFirebase, syncFromFirebase, updateUserMetrics } from './services/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';

const TOPICS = [
  "Kinh Thánh Cựu Ước",
  "Kinh Thánh Tân Ước",
  "Giáo Lý Hội Thánh Công Giáo",
  "Quy chế Tổng quát Sách Lễ Rôma",
  "Các ngày lễ trong năm Phụng vụ",
  "Lịch Sử Giáo Hội",
  "Giáo Hội Việt Nam",
  "Các Thánh Tử Đạo Việt Nam",
  "Các Giáo Phận",
  "Giáo Phận Xuân Lộc",
  "Kinh Nguyện Kitô Giáo",
  "Phong trào Thiếu Nhi Thánh Thể"
];

const TOPIC_ICONS: Record<string, React.FC<any>> = {
  "Kinh Thánh Cựu Ước": BookOpen,
  "Kinh Thánh Tân Ước": BookOpen,
  "Giáo Lý Hội Thánh Công Giáo": BookMarked,
  "Quy chế Tổng quát Sách Lễ Rôma": BookMarked,
  "Các ngày lễ trong năm Phụng vụ": Calendar,
  "Lịch Sử Giáo Hội": History,
  "Giáo Hội Việt Nam": Map,
  "Các Thánh Tử Đạo Việt Nam": Award,
  "Các Giáo Phận": MapPin,
  "Giáo Phận Xuân Lộc": MapPin,
  "Kinh Nguyện Kitô Giáo": Heart,
  "Phong trào Thiếu Nhi Thánh Thể": Users
};

const cleanTextForTTS = (text: string) => {
  if (!text) return '';
  return text
    .replace(/[*_]+/g, '') // Xóa markdown in đậm, in nghiêng
    .replace(/#/g, '') // Xóa markdown tiêu đề
    .replace(/\([^)]*\)/g, '') // Xóa toàn bộ nội dung trong dấu ngoặc đơn
    .replace(/\s{2,}/g, ' ') // Xóa khoảng trắng thừa do việc xóa ngoặc để lại
    .trim();
};

const getQuestionTextToRead = (q: Question, questionType: QuestionType) => {
  if (questionType === 'multiple-choice' || questionType === 'multiple-select') {
    const optionsText = q.options ? q.options.map((opt, i) => {
      let cleanOpt = cleanTextForTTS(opt).trim();
      cleanOpt = cleanOpt.replace(/^[A-F]([\.\:\)]\s*|\s+)/, '');
      return `${String.fromCharCode(65+i)}: ${cleanOpt}`;
    }).join('. ') : '';
    return `${cleanTextForTTS(q.question)}. ${optionsText}`;
  }
  return cleanTextForTTS(q.question);
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAppLoaded, setIsAppLoaded] = useState(false);
  const [contextContent, setContextContent] = useState<string>("");
  const [mode, setMode] = useState<'new' | 'old' | 'both'>('new');
  const [selectedTopics, setSelectedTopics] = useState<string[]>([TOPICS[0], TOPICS[1]]);
  const [customTopic, setCustomTopic] = useState<string>("");
  const [isCustomTopic, setIsCustomTopic] = useState(false);
  const [questionType, setQuestionType] = useState<QuestionType>('multiple-choice');
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [quizLevel, setQuizLevel] = useState<QuizLevel>('Nghĩa Sỹ');
  const [isStarted, setIsStarted] = useState(false);
  const wasStarted = useRef(false);
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSavedQuestionsOpen, setIsSavedQuestionsOpen] = useState(false);
  const [isKnownQuestionsOpen, setIsKnownQuestionsOpen] = useState(false);
  const [selectedDetailQuestion, setSelectedDetailQuestion] = useState<Question | null>(null);
  const [fontFamily, setFontFamily] = useState<string>('"Manrope", sans-serif');
  const [baseFontSize, setBaseFontSize] = useState<number>(typeof window !== 'undefined' && window.innerWidth < 768 ? 14 : 16);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [focusedEssayIndex, setFocusedEssayIndex] = useState<number | null>(null);
  
  const defaultProfile: Profile = {
    id: 'default',
    name: 'Mặc định',
    allocatedBytes: 40 * 1024 * 1024
  };
  
  const [profiles, setProfiles] = useState<Profile[]>([defaultProfile]);
  
  const [currentProfileId, setCurrentProfileId] = useState<string>('default');
  
  const [isProfileManagerOpen, setIsProfileManagerOpen] = useState(false);
  
  const [theme, setTheme] = useState({
      primary: '#1a365d',
      secondary: '#b7914b',
      bg: '#fcfcf9',
      surface: '#ffffff',
      text: '#2d3748'
  });

  const [reduceEffects, setReduceEffects] = useState<boolean>(false);

  const evaluationRef = useRef<HTMLDivElement>(null);

  // Apply theme, font, base font size and effects setting
  useEffect(() => {
    document.documentElement.style.setProperty('--color-primary', theme.primary);
    document.documentElement.style.setProperty('--color-secondary', theme.secondary);
    document.documentElement.style.setProperty('--color-background', theme.bg);
    document.documentElement.style.setProperty('--color-surface-container-lowest', theme.surface);
    document.documentElement.style.setProperty('--color-on-surface', theme.text);
    document.documentElement.style.setProperty('--font-body', fontFamily);
    document.documentElement.style.setProperty('--font-headline', fontFamily);
    document.documentElement.style.fontSize = `${baseFontSize}px`;
    
    if (reduceEffects) {
      document.documentElement.classList.add('reduce-effects');
    } else {
      document.documentElement.classList.remove('reduce-effects');
    }
    
    if (isAppLoaded) {
      IDB.setItem('appTheme', theme);
      IDB.setItem('appFont', fontFamily);
      IDB.setItem('appBaseFontSize', baseFontSize);
      IDB.setItem('appLevel', quizLevel);
      IDB.setItem('appReduceEffects', reduceEffects);
    }
  }, [theme, fontFamily, baseFontSize, quizLevel, reduceEffects, isAppLoaded]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isSettingsOpen || selectedDetailQuestion || showSuccess) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isSettingsOpen, selectedDetailQuestion, showSuccess]);

  const triggerConfetti = () => {
    const duration = 3 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

    const interval: any = setInterval(function() {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
    }, 250);
  };

  useEffect(() => {
    if (!isStarted && wasStarted.current) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    wasStarted.current = isStarted;
  }, [isStarted]);

  const [customProgressWidth, setCustomProgressWidth] = useState<number | null>(null);

  const handleResizeStart = (e: React.MouseEvent, direction: 'left' | 'right') => {
    e.preventDefault();
    const startX = e.clientX;
    const container = document.getElementById('progress-bar-container');
    const startWidth = customProgressWidth || container?.offsetWidth || 768;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const widthChange = direction === 'right' ? deltaX * 2 : -deltaX * 2;
      const newWidth = Math.max(300, Math.min(window.innerWidth * 0.95, startWidth + widthChange));
      setCustomProgressWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const [quiz, setQuiz] = useState<QuizState & { sessionQuestions: Question[], currentIndex: number, evaluatedResults: (boolean | null)[], targetQuestionCount: number }>({
    currentQuestion: null,
    sessionQuestions: [],
    currentIndex: -1,
    userAnswer: "",
    userAnswers: [],
    isEvaluated: false,
    evaluationResult: "",
    essayEvaluations: [],
    isSaved: false,
    loading: false,
    error: null,
    evaluatedResults: [],
    targetQuestionCount: 0
  });

  const [savedQuestions, setSavedQuestions] = useState<Question[]>([]); // "Chưa biết" questions (Unknown)
  const [knownQuestions, setKnownQuestions] = useState<Question[]>([]); // "Đã biết" questions (Known)
  const [savedPage, setSavedPage] = useState(1);
  const [knownPage, setKnownPage] = useState(1);
  const ITEMS_PER_PAGE = 5;
  const [expandedExplanations, setExpandedExplanations] = useState<Record<number, boolean>>({});

  const [isAutoTTS, setIsAutoTTS] = useState<boolean>(false);
  const [ttsVoice, setTtsVoice] = useState<string>('vi-VN-Standard-A');
  const [storageUsage, setStorageUsage] = useState({ used: '0 B', remaining: '40 MB', percentage: 0, isLow: false });
  const [profileSizes, setProfileSizes] = useState<Record<string, number>>({});
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioCacheRef = useRef<Record<number, string>>({});
  const [loadingMessage, setLoadingMessage] = useState("Đang tạo bộ câu hỏi..");
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  useEffect(() => {
    if (isAppLoaded) IDB.setItem('isAutoTTS', isAutoTTS);
    if (!isAutoTTS) {
      stopAudio();
    }
  }, [isAutoTTS, isAppLoaded]);

  useEffect(() => {
    if (isAppLoaded) IDB.setItem('ttsVoice', ttsVoice);
  }, [ttsVoice, isAppLoaded]);

  const stopAudio = useCallback(() => {
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
      } catch (e) {}
      audioSourceRef.current.disconnect();
      audioSourceRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  const playText = useCallback(async (text: string, questionIndex?: number) => {
    if (!isAutoTTS) return;
    stopAudio();
    setIsSpeaking(true);
    try {
      let base64 = questionIndex !== undefined ? audioCacheRef.current[questionIndex] : null;
      if (!base64) {
        base64 = await generateSpeech(text, ttsVoice);
        if (base64 && questionIndex !== undefined) {
          audioCacheRef.current[questionIndex] = base64;
        }
      }

      if (base64) {
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        const ctx = audioContextRef.current;
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }

        const binaryString = window.atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const int16Array = new Int16Array(bytes.buffer);
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
          float32Array[i] = int16Array[i] / 32768.0;
        }

        const audioBuffer = ctx.createBuffer(1, float32Array.length, 24000);
        audioBuffer.getChannelData(0).set(float32Array);

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.onended = () => setIsSpeaking(false);
        
        audioSourceRef.current = source;
        source.start();
      } else {
        setIsSpeaking(false);
      }
    } catch (e) {
      console.error(e);
      setIsSpeaking(false);
    }
  }, [isAutoTTS, stopAudio]);

  // Multiple Choice TTS
  useEffect(() => {
    if (isStarted && (questionType === 'multiple-choice' || questionType === 'multiple-select') && quiz.currentQuestion) {
      if (!quiz.isEvaluated) {
        const textToRead = getQuestionTextToRead(quiz.currentQuestion, questionType);
        playText(textToRead, quiz.currentIndex);
      } else {
        stopAudio();
      }
    }
  }, [quiz.currentIndex, isStarted, questionType, quiz.isEvaluated, playText, stopAudio]);

  // Clean up on unmount
  useEffect(() => {
    return () => stopAudio();
  }, [stopAudio]);

  const isCurrentQuestionSaved = quiz.currentQuestion && savedQuestions.some(sq => 
    sq.question === quiz.currentQuestion?.question && 
    sq.topic === quiz.currentQuestion?.topic
  );

  const isCurrentQuestionKnown = quiz.currentQuestion && knownQuestions.some(kq => 
    kq.question === quiz.currentQuestion?.question && 
    kq.topic === quiz.currentQuestion?.topic
  );

  const questionTopRef = useRef<HTMLDivElement>(null);
  const errorViewRef = useRef<HTMLDivElement>(null);
  const submitBtnRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll to evaluation
  useEffect(() => {
    if (quiz.isEvaluated && evaluationRef.current) {
      setTimeout(() => {
        evaluationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [quiz.isEvaluated]);

  // Auto-scroll to submit button when an answer is selected
  useEffect(() => {
    if (!quiz.isEvaluated && quiz.currentQuestion?.type === 'multiple-choice' && quiz.userAnswer && submitBtnRef.current) {
      setTimeout(() => {
        submitBtnRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [quiz.userAnswer, quiz.isEvaluated, quiz.currentQuestion]);

  // Auto-scroll to top of question when moving to next question or starting
  useEffect(() => {
    if (quiz.currentQuestion && questionTopRef.current) {
      const timer = setTimeout(() => {
        questionTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [quiz.currentIndex, quiz.currentQuestion]);

  // Auto-scroll to loading area when starting session
  useEffect(() => {
    if (quiz.loading && !quiz.currentQuestion && questionTopRef.current) {
      const timer = setTimeout(() => {
        questionTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [quiz.loading, quiz.currentQuestion]);

  // Fetch context file content
  useEffect(() => {
    const fetchContext = async () => {
      try {
        const response = await fetch('/context.md');
        if (response.ok) {
          const text = await response.text();
          setContextContent(text);
        }
      } catch (err) {
        console.error("Failed to load context file:", err);
      }
    };
    fetchContext();
  }, []);

  useEffect(() => {
    if (!auth) {
      setIsCheckingAuth(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        updateUserMetrics(u.uid, { 
          lastLoginAt: new Date().toISOString(),
          email: u.email
        });
        // Sync IDB from Firebase when logging in if local state doesn't have profiles
        const localProfiles = await IDB.getItem<Profile[]>('appProfiles');
        const localSaved = await IDB.getItem<Question[]>('savedQuestions');
        const hasNoData = (!localProfiles || localProfiles.length === 0 || (localProfiles.length === 1 && localProfiles[0].id === 'default')) && (!localSaved || localSaved.length === 0);
        
        if (hasNoData) {
           const firebaseData = await syncFromFirebase(u.uid);
           if (firebaseData && Object.keys(firebaseData).length > 0) {
             for (const key of Object.keys(firebaseData)) {
               await IDB.setItem(key, firebaseData[key]);
             }
             window.location.reload();
             return;
           }
        }
      }
      setIsCheckingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  // Listen to saved and known questions
  useEffect(() => {
    const migrateAndInit = async () => {
      if (!isAppLoaded) {
        let migrated = true;
        try { migrated = !!(await IDB.getItem('migrated_from_ls')); } catch {}
        if (!migrated) {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key !== 'migrated_from_ls') {
              const val = localStorage.getItem(key);
              if (val) {
                try {
                  await IDB.setItem(key, JSON.parse(val));
                } catch {
                  await IDB.setItem(key, val);
                }
              }
            }
          }
          await IDB.setItem('migrated_from_ls', true);
        }

        const p = await IDB.getItem<Profile[]>('appProfiles');
        if (p) setProfiles(p);
        const curP = await IDB.getItem<string>('currentProfileId');
        if (curP) setCurrentProfileId(curP);

        const lvl = await IDB.getItem<string>('appLevel');
        if (lvl) setQuizLevel(lvl as QuizLevel);
        const font = await IDB.getItem<string>('appFont');
        if (font) setFontFamily(font);
        const fSize = await IDB.getItem<number>('appBaseFontSize');
        if (fSize) setBaseFontSize(Number(fSize));
        const th = await IDB.getItem<any>('appTheme');
        if (th) setTheme(th);
        const fx = await IDB.getItem<any>('appReduceEffects');
        if (fx) setReduceEffects(fx === true || fx === 'true');
        const tts = await IDB.getItem<any>('isAutoTTS');
        if (tts !== null) setIsAutoTTS(tts === true || String(tts) === 'true');
        const v = await IDB.getItem<string>('ttsVoice');
        if (v) setTtsVoice(v);
        
        setIsAppLoaded(true);
      } else {
        const savedKey = currentProfileId === 'default' ? 'savedQuestions' : `savedQuestions_${currentProfileId}`;
        const knownKey = currentProfileId === 'default' ? 'knownQuestions' : `knownQuestions_${currentProfileId}`;

        const saved = await IDB.getItem<Question[]>(savedKey);
        setSavedQuestions(saved || []);

        const known = await IDB.getItem<Question[]>(knownKey);
        setKnownQuestions(known || []);
      }
    };
    migrateAndInit();
  }, [currentProfileId, isAppLoaded]);

  useEffect(() => {
    if (isAppLoaded) IDB.setItem('appProfiles', profiles);
  }, [profiles, isAppLoaded]);

  useEffect(() => {
    if (isAppLoaded) IDB.setItem('currentProfileId', currentProfileId);
  }, [currentProfileId, isAppLoaded]);

  const saveToLocalStorage = async (questions: Question[]) => {
    const key = currentProfileId === 'default' ? 'savedQuestions' : `savedQuestions_${currentProfileId}`;
    await IDB.setItem(key, questions);
    setSavedQuestions(questions);
  };

  const saveKnownToLocalStorage = async (questions: Question[]) => {
    const key = currentProfileId === 'default' ? 'knownQuestions' : `knownQuestions_${currentProfileId}`;
    await IDB.setItem(key, questions);
    setKnownQuestions(questions);
  };

  const formatApiError = (err: any): string => {
    const msg = err?.message || String(err);
    if (msg.includes('API_KEY_INVALID') || msg.includes('401') || msg.includes('unauthorized')) {
      return "Lỗi API: API Key không hợp lệ hoặc đã hết hạn. Vui lòng kiểm tra lại trong phần Cài đặt.";
    }
    if (msg.includes('quota')) {
      return "Lỗi API: Bạn đã hết hạn mức sử dụng (Quota exceeded). Vui lòng kiểm tra lại Google Cloud Console hoặc thử lại sau.";
    }
    if (msg.includes('429') || msg.includes('limit exceeded')) {
      return "Lỗi API: Tần suất yêu cầu quá cao (Rate limit exceeded). Vui lòng đợi 1-2 phút rồi thử lại.";
    }
    if (msg.includes('403') || msg.includes('permission')) {
      return "Lỗi API: Bạn không có quyền truy cập vào Model này. Vui lòng kiểm tra lại quyền của API Key.";
    }
    if (msg.includes('network') || msg.includes('fetch')) {
      return "Lỗi kết nối: Không thể kết nối tới máy chủ AI. Vui lòng kiểm tra mạng của bạn.";
    }
    return `Lỗi hệ thống: ${msg}`;
  };

  const trackApiUsage = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const currentUsage: any = await IDB.getItem('apiUsage') || { dailyGeminiCalls: 0, lastReset: today, recentApiTimestamps: [] };
      if (currentUsage.lastReset !== today) {
         currentUsage.dailyGeminiCalls = 0;
         currentUsage.lastReset = today;
      }
      currentUsage.dailyGeminiCalls += 1;
      currentUsage.recentApiTimestamps.unshift(new Date().toISOString());
      if (currentUsage.recentApiTimestamps.length > 5) {
         currentUsage.recentApiTimestamps.length = 5;
      }
      await IDB.setItem('apiUsage', currentUsage);
      
      if (user) {
         updateUserMetrics(user.uid, {
            dailyGeminiCalls: currentUsage.dailyGeminiCalls,
            recentApiTimestamps: currentUsage.recentApiTimestamps
         });
      }
    } catch(e) { console.error(e); }
  };

  const startSession = async () => {
    if (mode === 'old' && savedQuestions.length === 0) {
      setQuiz(prev => ({ ...prev, error: "Bạn chưa có câu hỏi nào trong kho 'Chưa biết'. Hãy chọn chế độ 'Câu hỏi mới' để bắt đầu." }));
      setTimeout(() => {
        errorViewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      return;
    }

    let targetCount = questionCount;
    if (mode === 'old') {
      targetCount = Math.min(questionCount, savedQuestions.length);
    } else if (mode === 'both') {
      const existingCount = Math.min(savedQuestions.length, Math.floor(questionCount / 2));
      const newCount = questionCount - existingCount;
      targetCount = existingCount + newCount;
    }

    setLoadingMessage("Đang tạo bộ câu hỏi..");
    audioCacheRef.current = {};
    setQuiz(prev => ({ 
      ...prev, 
      loading: true, 
      error: null, 
      sessionQuestions: [], 
      currentIndex: 0,
      currentQuestion: null,
      isEvaluated: false,
      userAnswer: "",
      evaluationResult: "",
      isSaved: false,
      targetQuestionCount: targetCount
    }));
    
    // Scroll to loading area
    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
      let initialQuestions: Question[] = [];

      let topicToUse = "";
      if (isCustomTopic && customTopic.trim()) {
        topicToUse = customTopic;
      } else if (selectedTopics.length > 0) {
        topicToUse = selectedTopics[Math.floor(Math.random() * selectedTopics.length)];
      } else {
        topicToUse = TOPICS[Math.floor(Math.random() * TOPICS.length)];
      }

      let generatedSuccessMessage = "";

      if (mode === 'old') {
        const shuffled = [...savedQuestions].sort(() => Math.random() - 0.5);
        initialQuestions = shuffled.slice(0, questionCount).map(q => ({ ...q, isNew: false }));
      } else if (mode === 'both') {
        const existingCount = Math.min(savedQuestions.length, Math.floor(questionCount / 2));
        const shuffled = [...savedQuestions].sort(() => Math.random() - 0.5);
        const oldQuestions = shuffled.slice(0, existingCount).map(q => ({ ...q, isNew: false }));
        
        const newCount = questionCount - existingCount;
        await trackApiUsage();
        const result = await generateQuestions(
          topicToUse, 
          questionType, 
          newCount, 
          contextContent, 
          quizLevel, 
          savedQuestions, 
          knownQuestions,
          (count) => setLoadingMessage(`Đang tạo bộ câu hỏi (${count-1}/${newCount})...`),
          (partialQuestions) => {
            setQuiz(prev => {
              const newSessionQuestions = [...oldQuestions, ...partialQuestions];
              return {
                ...prev,
                sessionQuestions: newSessionQuestions,
                currentQuestion: prev.currentQuestion || newSessionQuestions[0],
                userAnswers: new Array(newSessionQuestions.length).fill("").map((_, i) => prev.userAnswers[i] !== undefined ? prev.userAnswers[i] : ""),
                evaluatedResults: new Array(newSessionQuestions.length).fill(null).map((_, i) => prev.evaluatedResults?.[i] !== undefined ? prev.evaluatedResults[i] : null)
              };
            });
          }
        );
        const newQuestions = result.questions;
        generatedSuccessMessage = result.successMessage;
        
        initialQuestions = [...oldQuestions, ...newQuestions];
      } else if (mode === 'new') {
        await trackApiUsage();
        const result = await generateQuestions(
          topicToUse, 
          questionType, 
          questionCount, 
          contextContent, 
          quizLevel, 
          savedQuestions, 
          knownQuestions,
          (count) => setLoadingMessage(`Đang tạo bộ câu hỏi (${count-1}/${questionCount})...`),
          (partialQuestions) => {
            setQuiz(prev => {
              const newSessionQuestions = partialQuestions;
              return {
                ...prev,
                sessionQuestions: newSessionQuestions,
                currentQuestion: prev.currentQuestion || newSessionQuestions[0],
                userAnswers: new Array(newSessionQuestions.length).fill("").map((_, i) => prev.userAnswers[i] !== undefined ? prev.userAnswers[i] : ""),
                evaluatedResults: new Array(newSessionQuestions.length).fill(null).map((_, i) => prev.evaluatedResults?.[i] !== undefined ? prev.evaluatedResults[i] : null)
              };
            });
          }
        );
        initialQuestions = result.questions;
        generatedSuccessMessage = result.successMessage;
      }

      if (generatedSuccessMessage) {
        setSuccessMessage(generatedSuccessMessage);
      } else {
        setSuccessMessage("Bạn đã hoàn thành xuất sắc bộ câu hỏi ôn tập này. Hãy tiếp tục cố gắng nhé!");
      }

      if (initialQuestions.length > 0) {
        setExpandedExplanations({});
        setQuiz(prev => {
          const currentUserAnswers = [...prev.userAnswers];
          while (currentUserAnswers.length < initialQuestions.length) currentUserAnswers.push("");
          const currentEvaluatedResults = [...(prev.evaluatedResults || [])];
          while (currentEvaluatedResults.length < initialQuestions.length) currentEvaluatedResults.push(null);
          
          return { 
            ...prev, 
            sessionQuestions: initialQuestions, 
            currentQuestion: prev.currentQuestion || initialQuestions[0],
            userAnswers: currentUserAnswers,
            evaluatedResults: currentEvaluatedResults,
            essayEvaluations: prev.essayEvaluations || [],
            loading: prev.loading // Giữ nguyên trạng thái loading hiện tại
          };
        });

        if (isAutoTTS) {
          setLoadingMessage(`Đang chuẩn bị âm thanh (0/${initialQuestions.length})...`);
          
          (async () => {
            let hasError = false;
            for (let i = 0; i < initialQuestions.length; i++) {
              const q = initialQuestions[i];
              const textToRead = getQuestionTextToRead(q, questionType);
              try {
                const base64 = await generateSpeech(textToRead, ttsVoice);
                if (base64) {
                  audioCacheRef.current[i] = base64;
                } else {
                  hasError = true;
                }
              } catch (e) {
                console.error("Failed to pre-generate audio for question", i, e);
                hasError = true;
              }
              
              setLoadingMessage(prev => {
                if (prev.startsWith("Đang chuẩn bị")) {
                  return `Đang chuẩn bị âm thanh (${i + 1}/${initialQuestions.length})...`;
                }
                return prev;
              });
            }
            
            setQuiz(prev => {
              if (prev.loading) {
                setTimeout(() => {
                  setIsStarted(true);
                  setTimeout(() => {
                    questionTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }, 100);
                }, 0);
                return { ...prev, loading: false };
              }
              return prev;
            });
          })();
        } else {
          setQuiz(prev => {
            if (prev.loading) {
              setTimeout(() => {
                setIsStarted(true);
                setTimeout(() => {
                  questionTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
              }, 0);
              return { ...prev, loading: false };
            }
            return prev;
          });
        }
      } else {
        throw new Error("Không thể tạo câu hỏi. Vui lòng thử lại.");
      }
    } catch (err: any) {
      setQuiz(prev => ({ ...prev, loading: false, error: formatApiError(err) }));
      setIsStarted(false);
      setTimeout(() => {
        errorViewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  };

  const finishQuiz = async () => {
    setIsStarted(false);
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
    triggerConfetti();
    setShowSuccess(true);
    setQuiz(prev => ({ 
      ...prev, 
      currentQuestion: null, 
      currentIndex: -1, 
      loading: false 
    }));
    
    // Backup to Firebase
    if (user) {
      try {
        const keys = await IDB.getAllKeys();
        const data: Record<string, any> = {};
        for (const key of keys) {
           data[key] = await IDB.getItem(key);
        }
        await syncToFirebase(user.uid, data);
      } catch (err) {
        console.error("Backup to Firebase failed", err);
      }
    }
  };

  const getPreviousQuestion = () => {
    setQuiz(prev => {
      if (prev.currentIndex <= 0) return prev;
      const prevIndex = prev.currentIndex - 1;
      
      // Save current answer if not evaluated
      const newAnswers = [...prev.userAnswers];
      if (!prev.isEvaluated) {
        newAnswers[prev.currentIndex] = prev.userAnswer;
      }

      const isEvaluated = prev.evaluatedResults[prevIndex] !== null;
      let evaluationResult = "";
      if (isEvaluated) {
        const isCorrect = prev.evaluatedResults[prevIndex];
        const question = prev.sessionQuestions[prevIndex];
        evaluationResult = isCorrect ? "Chính xác!" : `Sai rồi. Đáp án đúng là: ${question.correctAnswer}`;
      }

      return {
        ...prev,
        currentIndex: prevIndex,
        currentQuestion: prev.sessionQuestions[prevIndex],
        isEvaluated: isEvaluated,
        userAnswer: newAnswers[prevIndex] || "",
        userAnswers: newAnswers,
        evaluationResult: evaluationResult,
        isSaved: false,
      };
    });
  };

  const goToQuestion = (index: number) => {
    if (index < 0 || index >= quiz.sessionQuestions.length) return;
    
    if (questionType === 'multiple-choice' || questionType === 'multiple-select') {
      setQuiz(prev => {
        // Save current answer if not evaluated
        const newAnswers = [...prev.userAnswers];
        if (!prev.isEvaluated && prev.currentIndex !== -1) {
          newAnswers[prev.currentIndex] = prev.userAnswer;
        }

        const isEvaluated = prev.evaluatedResults[index] !== null;
        let evaluationResult = "";
        if (isEvaluated) {
          const isCorrect = prev.evaluatedResults[index];
          const question = prev.sessionQuestions[index];
          evaluationResult = isCorrect ? "Chính xác!" : `Sai rồi. Đáp án đúng là: ${question.correctAnswer}`;
        }

        return {
          ...prev,
          currentIndex: index,
          currentQuestion: prev.sessionQuestions[index],
          isEvaluated: isEvaluated,
          userAnswer: newAnswers[index] || "",
          userAnswers: newAnswers,
          evaluationResult: evaluationResult,
          isSaved: false,
        };
      });
    } else {
      // For essay questions, scroll to the question
      const element = document.getElementById(`essay-question-${index}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const textarea = element.querySelector('textarea');
        if (textarea) textarea.focus();
      }
    }
  };

  const getNextQuestion = () => {
    if (quiz.currentIndex + 1 >= (quiz.targetQuestionCount || quiz.sessionQuestions.length)) {
      finishQuiz();
      return;
    }

    if (quiz.currentIndex + 1 >= quiz.sessionQuestions.length) {
      // Still generating, do nothing
      return;
    }

    setQuiz(prev => {
      const nextIndex = prev.currentIndex + 1;
      
      // Save current answer if not evaluated
      const newAnswers = [...prev.userAnswers];
      if (!prev.isEvaluated) {
        newAnswers[prev.currentIndex] = prev.userAnswer;
      }

      const isEvaluated = prev.evaluatedResults[nextIndex] !== null;
      let evaluationResult = "";
      if (isEvaluated) {
        const isCorrect = prev.evaluatedResults[nextIndex];
        const question = prev.sessionQuestions[nextIndex];
        evaluationResult = isCorrect ? "Chính xác!" : `Sai rồi. Đáp án đúng là: ${question.correctAnswer}`;
      }

      return {
        ...prev,
        currentIndex: nextIndex,
        currentQuestion: prev.sessionQuestions[nextIndex],
        isEvaluated: isEvaluated,
        userAnswer: newAnswers[nextIndex] || "",
        userAnswers: newAnswers,
        evaluationResult: evaluationResult,
        isSaved: false,
      };
    });
  };

  const handleAnswerSubmit = async () => {
    setQuiz(prev => ({ ...prev, loading: true }));

    try {
      if (questionType === 'multiple-choice' || questionType === 'multiple-select') {
        if (!quiz.currentQuestion || !quiz.userAnswer) {
          setQuiz(prev => ({ ...prev, loading: false }));
          return;
        }
        
        let isCorrect = false;

        if (questionType === 'multiple-select') {
          const userAnsArray = quiz.userAnswer.split(',').map(s => s.trim().toUpperCase()).sort();
          const rawCorrectAns = quiz.currentQuestion.correctAnswer.trim().toUpperCase();
          
          // Extract letters from correctAnswer (e.g., "A, C" -> ["A", "C"], "A. ..., C. ..." -> ["A", "C"])
          const correctAnsArray = rawCorrectAns.split(',').map(s => {
            const match = s.trim().match(/^[A-F]/);
            return match ? match[0] : '';
          }).filter(Boolean).sort();

          isCorrect = userAnsArray.length === correctAnsArray.length && userAnsArray.every((val, index) => val === correctAnsArray[index]);
        } else {
          const userAns = quiz.userAnswer.trim().toUpperCase();
          const rawCorrectAns = quiz.currentQuestion.correctAnswer.trim();
          const correctAnsUpper = rawCorrectAns.toUpperCase();
          
          // 1. Check if correctAnswer starts with the selected letter (e.g., "A. ...", "A: ...", "A) ...")
          if (
            correctAnsUpper.startsWith(userAns + '.') || 
            correctAnsUpper.startsWith(userAns + ':') || 
            correctAnsUpper.startsWith(userAns + ')') || 
            correctAnsUpper.startsWith(userAns + ' ') || 
            correctAnsUpper === userAns
          ) {
            isCorrect = true;
          } else {
            // 2. Try to match by option content
            const options = quiz.currentQuestion.options || [];
            const userOptionIndex = userAns.charCodeAt(0) - 65; // 'A' -> 0, 'B' -> 1, etc.
            
            if (userOptionIndex >= 0 && userOptionIndex < options.length) {
              const userOptionText = options[userOptionIndex].trim().toUpperCase();
              
              // Remove prefixes like "A. " from the option text for comparison
              const cleanUserOptionText = userOptionText.replace(/^[A-D][.:)]?\s*/, '');
              const cleanCorrectAns = correctAnsUpper.replace(/^[A-D][.:)]?\s*/, '');
              
              if (
                cleanUserOptionText === cleanCorrectAns ||
                cleanUserOptionText.includes(cleanCorrectAns) ||
                cleanCorrectAns.includes(cleanUserOptionText)
              ) {
                isCorrect = true;
              }
            }
            
            // 3. Last fallback: just check the first character if it's A, B, C, or D
            if (!isCorrect && /^[A-D]$/.test(correctAnsUpper.charAt(0))) {
              isCorrect = userAns === correctAnsUpper.charAt(0);
            }
          }
        }

        setQuiz(prev => {
          const newAnswers = [...prev.userAnswers];
          newAnswers[prev.currentIndex] = quiz.userAnswer;
          const newEvaluatedResults = [...prev.evaluatedResults];
          newEvaluatedResults[prev.currentIndex] = isCorrect;
          return { 
            ...prev, 
            isEvaluated: true, 
            evaluationResult: isCorrect ? "Chính xác!" : `Sai rồi. Đáp án đúng là: ${quiz.currentQuestion?.correctAnswer}`,
            loading: false,
            userAnswers: newAnswers,
            evaluatedResults: newEvaluatedResults
          };
        });
      } else {
        const qaList = quiz.sessionQuestions.map((q, i) => ({
          question: q.question,
          correctAnswer: q.correctAnswer,
          userAnswer: quiz.userAnswers[i] || "Không trả lời"
        }));
        await trackApiUsage();
        const results = await evaluateAllEssayAnswers(qaList);
        const newEvaluatedResults = results.map(r => r.score >= 5);
        setQuiz(prev => ({ 
          ...prev, 
          isEvaluated: true, 
          essayEvaluations: results,
          evaluatedResults: newEvaluatedResults,
          loading: false 
        }));
        // Auto scroll to top of questions after evaluation
        setTimeout(() => {
          questionTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    } catch (err: any) {
      setQuiz(prev => ({ ...prev, loading: false, error: "Đánh giá thất bại: " + formatApiError(err) }));
    }
  };

  const saveQuestion = () => {
    if (!quiz.currentQuestion) return;

    if (isCurrentQuestionSaved) {
      // Undo: Remove from saved
      const newSavedQuestions = savedQuestions.filter(sq => 
        sq.question !== quiz.currentQuestion?.question || sq.topic !== quiz.currentQuestion?.topic
      );
      saveToLocalStorage(newSavedQuestions);
      setQuiz(prev => ({ ...prev, isSaved: false }));
      return;
    }

    const questionToSave = {
      ...quiz.currentQuestion,
      id: Date.now().toString(),
      savedAt: new Date().toISOString()
    };
    delete questionToSave.isNew;

    // Remove from known if it exists there
    const newKnownQuestions = knownQuestions.filter(kq => 
      kq.question !== questionToSave.question || kq.topic !== questionToSave.topic
    );
    saveKnownToLocalStorage(newKnownQuestions);

    const newSavedQuestions = [questionToSave, ...savedQuestions];
    saveToLocalStorage(newSavedQuestions);
    setQuiz(prev => ({ ...prev, isSaved: true }));
  };

  const saveEssayQuestion = (idx: number) => {
    const question = quiz.sessionQuestions[idx];
    if (!question) return;

    const isSaved = savedQuestions.some(sq => sq.question === question.question && sq.topic === question.topic);

    if (isSaved) {
      const newSavedQuestions = savedQuestions.filter(sq => 
        sq.question !== question.question || sq.topic !== question.topic
      );
      saveToLocalStorage(newSavedQuestions);
      return;
    }

    const questionToSave = {
      ...question,
      id: Date.now().toString() + idx,
      savedAt: new Date().toISOString()
    };
    delete questionToSave.isNew;

    // Remove from known if it exists there
    const newKnownQuestions = knownQuestions.filter(kq => 
      kq.question !== questionToSave.question || kq.topic !== questionToSave.topic
    );
    saveKnownToLocalStorage(newKnownQuestions);

    const newSavedQuestions = [questionToSave, ...savedQuestions];
    saveToLocalStorage(newSavedQuestions);
  };

  const saveEssayToKnown = (idx: number) => {
    const question = quiz.sessionQuestions[idx];
    if (!question) return;

    const isKnown = knownQuestions.some(kq => kq.question === question.question && kq.topic === question.topic);

    if (isKnown) {
      const newKnownQuestions = knownQuestions.filter(kq => 
        kq.question !== question.question || kq.topic !== question.topic
      );
      saveKnownToLocalStorage(newKnownQuestions);
      return;
    }

    const questionToSave = {
      ...question,
      id: Date.now().toString() + idx,
      savedAt: new Date().toISOString()
    };
    delete questionToSave.isNew;

    // Remove from saved (Unknown) if it exists there
    const newSavedQuestions = savedQuestions.filter(sq => 
      sq.question !== questionToSave.question || sq.topic !== questionToSave.topic
    );
    saveToLocalStorage(newSavedQuestions);

    const newKnownQuestions = [questionToSave, ...knownQuestions];
    saveKnownToLocalStorage(newKnownQuestions);
  };

  const saveToKnown = () => {
    if (!quiz.currentQuestion) return;

    if (isCurrentQuestionKnown) {
      // Undo: Remove from known
      const newKnownQuestions = knownQuestions.filter(kq => 
        kq.question !== quiz.currentQuestion?.question || kq.topic !== quiz.currentQuestion?.topic
      );
      saveKnownToLocalStorage(newKnownQuestions);
      setQuiz(prev => ({ ...prev, isSaved: false }));
      return;
    }

    const questionToSave = {
      ...quiz.currentQuestion,
      id: Date.now().toString(),
      savedAt: new Date().toISOString()
    };
    delete questionToSave.isNew;

    // Remove from saved (unknown) if it exists there
    const newSavedQuestions = savedQuestions.filter(sq => 
      sq.question !== questionToSave.question || sq.topic !== questionToSave.topic
    );
    saveToLocalStorage(newSavedQuestions);

    const newKnownQuestions = [questionToSave, ...knownQuestions];
    saveKnownToLocalStorage(newKnownQuestions);
    setQuiz(prev => ({ ...prev, isSaved: true }));
  };

  const deleteSavedQuestion = (id: string) => {
    const newSavedQuestions = savedQuestions.filter(q => q.id !== id);
    saveToLocalStorage(newSavedQuestions);

    // Remove from current session if it exists
    setQuiz(prev => ({
      ...prev,
      sessionQuestions: prev.sessionQuestions.filter(q => q.id !== id),
      currentQuestion: prev.currentQuestion?.id === id ? null : prev.currentQuestion
    }));
  };

  const calculateSize = (questions: Question[]) => {
    const sizeInBytes = new Blob([JSON.stringify(questions)]).size;
    if (sizeInBytes < 1024) return `${sizeInBytes} B`;
    if (sizeInBytes < 1024 * 1024) return `${(sizeInBytes / 1024).toFixed(2)} KB`;
    return `${(sizeInBytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  useEffect(() => {
    const updateSize = async () => {
      const currentProfile = profiles.find(p => p.id === currentProfileId) || profiles[0];
      const limitBytes = currentProfile.allocatedBytes || (40 * 1024 * 1024);
      
      const str1 = JSON.stringify(savedQuestions);
      const str2 = JSON.stringify(knownQuestions);
      const usedBytes = new Blob([str1, str2]).size;
      
      const remainingBytes = Math.max(0, limitBytes - usedBytes);
      const percentage = Math.min(100, (usedBytes / limitBytes) * 100);
      
      const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
      };
      
      setStorageUsage({
        used: formatSize(usedBytes),
        remaining: formatSize(remainingBytes),
        percentage: Number(percentage.toFixed(1)),
        isLow: percentage > 85
      });
    };
    updateSize();
  }, [savedQuestions, knownQuestions, currentProfileId, profiles]);

  const deleteKnownQuestion = (id: string) => {
    const newKnownQuestions = knownQuestions.filter(q => q.id !== id);
    saveKnownToLocalStorage(newKnownQuestions);

    // Remove from current session if it exists
    setQuiz(prev => ({
      ...prev,
      sessionQuestions: prev.sessionQuestions.filter(q => q.id !== id),
      currentQuestion: prev.currentQuestion?.id === id ? null : prev.currentQuestion
    }));
  };

  const moveSavedToKnown = (question: Question) => {
    // Remove from saved
    const newSavedQuestions = savedQuestions.filter(q => q.id !== question.id);
    saveToLocalStorage(newSavedQuestions);

    // Add to known
    const questionToSave = {
      ...question,
      id: Date.now().toString(),
      savedAt: new Date().toISOString()
    };
    delete questionToSave.isNew;
    const newKnownQuestions = [questionToSave, ...knownQuestions];
    saveKnownToLocalStorage(newKnownQuestions);
  };

  const moveKnownToSaved = (question: Question) => {
    // Remove from known
    const newKnownQuestions = knownQuestions.filter(q => q.id !== question.id);
    saveKnownToLocalStorage(newKnownQuestions);

    // Add to saved
    const questionToSave = {
      ...question,
      id: Date.now().toString(),
      savedAt: new Date().toISOString()
    };
    delete questionToSave.isNew;
    const newSavedQuestions = [questionToSave, ...savedQuestions];
    saveToLocalStorage(newSavedQuestions);
  };

  const clearSavedQuestions = () => {
    saveToLocalStorage([]);
    setQuiz(prev => ({
      ...prev,
      sessionQuestions: prev.sessionQuestions.filter(q => !savedQuestions.some(sq => sq.id === q.id)),
      currentQuestion: savedQuestions.some(sq => sq.id === prev.currentQuestion?.id) ? null : prev.currentQuestion
    }));
  };

  const clearKnownQuestions = () => {
    saveKnownToLocalStorage([]);
    setQuiz(prev => ({
      ...prev,
      sessionQuestions: prev.sessionQuestions.filter(q => !knownQuestions.some(kq => kq.id === q.id)),
      currentQuestion: knownQuestions.some(kq => kq.id === prev.currentQuestion?.id) ? null : prev.currentQuestion
    }));
  };

  const getProfileUsedBytes = (profileId: string) => {
    return profileSizes[profileId] || 0;
  };

  useEffect(() => {
    const fetchSizes = async () => {
      if (isProfileManagerOpen) {
        const sizes: Record<string, number> = {};
        for (const p of profiles) {
          const savedKey = p.id === 'default' ? 'savedQuestions' : `savedQuestions_${p.id}`;
          const knownKey = p.id === 'default' ? 'knownQuestions' : `knownQuestions_${p.id}`;
          const savedList = await IDB.getItem<any>(savedKey);
          const knownList = await IDB.getItem<any>(knownKey);
          const s = JSON.stringify(savedList || []).length * 2;
          const k = JSON.stringify(knownList || []).length * 2;
          sizes[p.id] = s + k;
        }
        setProfileSizes(sizes);
      }
    };
    fetchSizes();
  }, [isProfileManagerOpen, profiles, currentProfileId]);

  const reallocateStorage = (currentProfiles: Profile[]) => {
    const totalBytes = 40 * 1024 * 1024;
    const bytesPerProfile = Math.floor(totalBytes / currentProfiles.length);
    return currentProfiles.map(p => ({ ...p, allocatedBytes: bytesPerProfile }));
  };

  const createProfile = () => {
    const newProfile: Profile = {
      id: Date.now().toString(),
      name: `Profile ${profiles.length + 1}`,
      allocatedBytes: 0
    };
    const newProfiles = reallocateStorage([...profiles, newProfile]);
    setProfiles(newProfiles);
    setCurrentProfileId(newProfile.id);
  };

  const deleteProfile = async (id: string) => {
    if (profiles.length <= 1) return;
    const newProfiles = reallocateStorage(profiles.filter(p => p.id !== id));
    setProfiles(newProfiles);
    if (currentProfileId === id) {
      setCurrentProfileId(newProfiles[0].id);
    }
    await IDB.removeItem(`savedQuestions_${id}`);
    await IDB.removeItem(`knownQuestions_${id}`);
  };

  const renameProfile = (id: string, newName: string) => {
    setProfiles(profiles.map(p => p.id === id ? { ...p, name: newName } : p));
  };

  const handleAllocate = (profileId: string, newAllocatedBytes: number) => {
    setProfiles(profiles.map(p => p.id === profileId ? { ...p, allocatedBytes: newAllocatedBytes } : p));
  };

  const totalBytes = 40 * 1024 * 1024;
  const unallocatedBytes = totalBytes - profiles.reduce((acc, p) => acc + p.allocatedBytes, 0);

  const totalSavedPages = Math.ceil(savedQuestions.length / ITEMS_PER_PAGE) || 1;
  const currentSavedQuestions = savedQuestions.slice(
    (savedPage - 1) * ITEMS_PER_PAGE,
    savedPage * ITEMS_PER_PAGE
  );

  const totalKnownPages = Math.ceil(knownQuestions.length / ITEMS_PER_PAGE) || 1;
  const currentKnownQuestions = knownQuestions.slice(
    (knownPage - 1) * ITEMS_PER_PAGE,
    knownPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    if (savedPage > totalSavedPages) setSavedPage(totalSavedPages);
  }, [savedQuestions.length, totalSavedPages, savedPage]);

  useEffect(() => {
    if (knownPage > totalKnownPages) setKnownPage(totalKnownPages);
  }, [knownQuestions.length, totalKnownPages, knownPage]);

  if (isCheckingAuth || !isAppLoaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4 transition-colors duration-300" style={{ backgroundColor: theme.bg }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: theme.primary, borderTopColor: 'transparent' }}></div>
          <p className="font-bold text-sm tracking-widest uppercase animate-pulse" style={{ color: theme.primary }}>Đang tải...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden transition-colors duration-300" style={{ backgroundColor: theme.bg }}>
         {!reduceEffects && (
          <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden opacity-40 mix-blend-multiply dark:mix-blend-screen transition-opacity duration-500">
            <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-primary/40 rounded-full filter blur-[100px] animate-blob"></div>
            <div className="absolute bottom-[-20%] right-[-10%] w-96 h-96 bg-secondary/40 rounded-full filter blur-[100px] animate-blob animation-delay-2000"></div>
          </div>
        )}
        <div className="glass-panel p-8 md:p-12 rounded-[40px] max-w-md w-full relative z-10 text-center shadow-xl">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <BookOpen className="w-10 h-10 text-primary" strokeWidth={1.5} />
          </div>
          <h1 className="text-3xl font-black font-headline text-primary mb-2">Giáo Lý Công Giáo</h1>
          <p className="text-on-surface-variant text-sm mb-8 leading-relaxed">
            Ứng dụng AI ôn tập giáo lý thông minh.<br/>
            Vui lòng đăng nhập để sử dụng nhé!
          </p>
          <button
            onClick={async () => {
              try {
                await loginWithGoogle();
              } catch(e: any) {
                console.error(e);
                if (e.code === 'auth/unauthorized-domain') {
                  alert(`Lỗi: Tên miền này chưa được thêm vào danh sách Authorized domains trên Firebase. Vui lòng vào Firebase Console -> Authentication -> Settings -> Authorized domains và thêm tên miền hiện tại (${window.location.hostname}) vào danh sách.`);
                } else if (e.code === 'auth/popup-closed-by-user') {
                  // Ignore if user manually closed it
                  console.log('Popup closed by user');
                } else {
                  alert(`Lỗi đăng nhập: ${e.message || 'Vui lòng thử lại.'}`);
                }
              }
            }}
            className="w-full flex items-center justify-center gap-3 bg-surface-container hover:bg-surface-container-high text-on-surface py-4 px-6 rounded-2xl font-bold transition-all shadow-sm hover:shadow-md border border-outline-variant/30 active:scale-95"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Đăng nhập với Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden text-on-surface p-4 md:p-8 transition-colors duration-300">
      {/* Animated gradient background map */}
      {!reduceEffects && (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden opacity-40 mix-blend-multiply dark:mix-blend-screen transition-opacity duration-500">
          <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-primary/40 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[100px] animate-blob"></div>
          <div className="absolute top-[20%] right-[-10%] w-96 h-96 bg-secondary/40 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[100px] animate-blob animation-delay-2000"></div>
          <div className="absolute bottom-[-20%] left-[20%] w-[500px] h-[500px] bg-primary/20 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[120px] animate-blob animation-delay-4000"></div>
        </div>
      )}
      
      <div className="relative z-10">
      {/* Profile Manager Modal */}
      <AnimatePresence>
        {isProfileManagerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] backdrop-blur-sm bg-black/20"
              onClick={() => setIsProfileManagerOpen(false)}
            />
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 pointer-events-none">
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="relative glass-panel p-6 md:p-10 rounded-[40px] max-w-lg w-full pointer-events-auto"
              >
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <h2 className="text-2xl font-black font-headline text-primary">Quản lý Profile</h2>
                    <p className="text-sm text-on-surface-variant mt-1">
                      Dung lượng chưa cấp phát: {(unallocatedBytes / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>
                  <button 
                    onClick={() => setIsProfileManagerOpen(false)}
                    className="p-2 hover:bg-surface-container-low/50 backdrop-blur-md active:scale-95 rounded-full transition-all text-on-surface-variant hover:text-primary"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="space-y-4 mb-8 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                  {profiles.map(profile => {
                    const usedBytes = getProfileUsedBytes(profile.id);
                    const maxAllowed = profile.allocatedBytes + unallocatedBytes;
                    
                    return (
                    <div 
                      key={profile.id} 
                      className={`p-4 rounded-2xl border-2 transition-all flex flex-col gap-3 ${
                        currentProfileId === profile.id 
                          ? 'border-primary bg-primary/5' 
                          : 'border-outline-variant/30 bg-surface-container-low/50 backdrop-blur-md'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 mr-4">
                          <input
                            type="text"
                            value={profile.name}
                            onChange={(e) => renameProfile(profile.id, e.target.value)}
                            className="w-full bg-transparent font-bold text-primary focus:outline-none focus:border-b border-primary/30"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          {currentProfileId !== profile.id && (
                            <button
                              onClick={() => setCurrentProfileId(profile.id)}
                              className="px-3 py-1.5 text-xs font-bold bg-primary text-on-primary rounded-lg hover:bg-primary/90 active:scale-95 transition-all"
                            >
                              Chọn
                            </button>
                          )}
                          {profiles.length > 1 && (
                            <button
                              onClick={() => deleteProfile(profile.id)}
                              className="p-1.5 text-error hover:bg-error/10 rounded-lg active:scale-95 transition-all"
                              title="Xóa profile"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                      
                      {/* Storage Allocation Slider */}
                      <div className="mt-1">
                        <div className="flex justify-between text-[11px] text-on-surface-variant mb-2 font-medium">
                          <span>Đã dùng: {(usedBytes / (1024 * 1024)).toFixed(2)} MB</span>
                          <span>Cấp phát: {(profile.allocatedBytes / (1024 * 1024)).toFixed(2)} MB</span>
                        </div>
                        <input
                          type="range"
                          min={usedBytes}
                          max={maxAllowed}
                          step={1024 * 100} // 100KB steps
                          value={profile.allocatedBytes}
                          onChange={(e) => handleAllocate(profile.id, parseInt(e.target.value))}
                          className="w-full h-2 bg-surface-variant rounded-full appearance-none cursor-pointer accent-primary"
                        />
                      </div>
                    </div>
                  )})}
                </div>

                <button
                  onClick={createProfile}
                  className="w-full py-4 rounded-2xl border-2 border-dashed border-primary/30 text-primary font-bold hover:bg-primary/5 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <PlusCircle className="w-5 h-5" />
                  Tạo Profile mới
                </button>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] backdrop-blur-sm"
              onClick={() => setIsSettingsOpen(false)}
            />
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 pointer-events-none">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="relative glass-panel p-6 md:p-8 rounded-3xl max-w-md w-full max-h-[90vh] overflow-y-auto no-scrollbar pointer-events-auto"
              >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-primary flex items-center gap-2">
                  <Settings className="w-6 h-6" /> Cài đặt giao diện
                </h2>
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-2 hover:bg-surface-container-low/50 backdrop-blur-md active:scale-95 rounded-full transition-all text-on-surface-variant hover:text-primary"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-8">
                {/* Font Selection */}
                <div>
                  <label className="text-xs uppercase tracking-widest font-bold text-secondary mb-3 block">Phông chữ (Font)</label>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { name: 'Manrope (Sans-serif)', value: '"Manrope", sans-serif', class: 'font-sans' },
                      { name: 'Inter (Sans-serif)', value: '"Inter", sans-serif', class: 'font-sans' },
                      { name: 'Cormorant Garamond (Serif)', value: '"Cormorant Garamond", serif', class: 'font-serif' },
                      { name: 'Montserrat (Sans-serif)', value: '"Montserrat", sans-serif', class: 'font-sans font-medium' },
                    ].map((font) => (
                      <button
                        key={font.value}
                        onClick={() => setFontFamily(font.value)}
                        className={`p-3 rounded-xl border-2 text-left transition-all active:scale-95 ${
                          fontFamily === font.value 
                            ? 'border-primary bg-primary/5 text-primary font-bold' 
                            : 'border-outline-variant/20 hover:border-primary/30 text-on-surface/80'
                        } ${font.class}`}
                        style={{ fontFamily: font.value }}
                      >
                        {font.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Text Scale (Modular Scale) */}
                <div>
                  <label className="text-xs uppercase tracking-widest font-bold text-secondary mb-3 block">Kích thước chữ (Modular Scale)</label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {[
                      { name: 'Nhỏ', value: 14 },
                      { name: 'Tiêu chuẩn', value: 16 },
                      { name: 'Lớn', value: 18 },
                      { name: 'Rất lớn', value: 20 },
                    ].map((size) => (
                      <button
                        key={size.value}
                        onClick={() => setBaseFontSize(size.value)}
                        className={`p-3 rounded-xl border-2 text-center transition-all active:scale-95 ${
                          baseFontSize === size.value 
                            ? 'border-primary bg-primary/5 text-primary font-bold' 
                            : 'border-outline-variant/20 hover:border-primary/30 text-on-surface/80'
                        }`}
                      >
                        {size.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Theme Options */}
                <div>
                  <label className="text-xs uppercase tracking-widest font-bold text-secondary mb-3 block">Giao diện (Đồ họa)</label>
                  <label className="group flex flex-col gap-2 p-4 rounded-xl glass-panel cursor-pointer active:scale-[0.98] transition-all border border-outline-variant/20 hover:border-primary/30 mb-4">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm block">Giảm thiểu hiệu ứng</span>
                      <div className={`w-10 h-5 rounded-full transition-colors relative ${reduceEffects ? 'bg-primary' : 'bg-outline-variant/30'}`}>
                        <div className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${reduceEffects ? 'left-[calc(100%-18px)]' : 'left-[2px]'}`} />
                      </div>
                    </div>
                    <span className="text-[11px] text-on-surface-variant leading-relaxed">Tắt Animation nền, hiệu ứng kính mờ (Khuyên dùng khi máy bị giật/lag)</span>
                    <input 
                      type="checkbox" 
                      checked={reduceEffects} 
                      onChange={(e) => setReduceEffects(e.target.checked)} 
                      className="hidden" 
                    />
                  </label>

                  <label className="group flex flex-col gap-2 p-4 rounded-xl glass-panel cursor-pointer active:scale-[0.98] transition-all border border-outline-variant/20 hover:border-primary/30 mb-6">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm block">Tự động đọc câu hỏi</span>
                      <div className={`w-10 h-5 rounded-full transition-colors relative ${isAutoTTS ? 'bg-primary' : 'bg-outline-variant/30'}`}>
                        <div className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${isAutoTTS ? 'left-[calc(100%-18px)]' : 'left-[2px]'}`} />
                      </div>
                    </div>
                    <span className="text-[11px] text-on-surface-variant leading-relaxed">Sử dụng AI để đọc to câu hỏi và các lựa chọn ngay khi chúng xuất hiện</span>
                    <input 
                      type="checkbox" 
                      checked={isAutoTTS} 
                      onChange={(e) => setIsAutoTTS(e.target.checked)} 
                      className="hidden" 
                    />
                  </label>
                </div>


                {/* TTS Voice Selection */}
                <div>
                  <label className="text-xs uppercase tracking-widest font-bold text-secondary mb-3 block">Giọng đọc (TTS Voice)</label>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { name: 'Giọng Nữ 1 (Standard-A)', value: 'vi-VN-Standard-A' },
                      { name: 'Giọng Nam 1 (Standard-B)', value: 'vi-VN-Standard-B' },
                      { name: 'Giọng Nữ 2 (Standard-C)', value: 'vi-VN-Standard-C' },
                      { name: 'Giọng Nam 2 (Standard-D)', value: 'vi-VN-Standard-D' },
                    ].map((voice) => (
                      <button
                        key={voice.value}
                        onClick={() => setTtsVoice(voice.value)}
                        className={`p-3 rounded-xl border-2 text-left transition-all active:scale-95 ${
                          ttsVoice === voice.value 
                            ? 'border-primary bg-primary/5 text-primary font-bold' 
                            : 'border-outline-variant/20 hover:border-primary/30 text-on-surface/80'
                        }`}
                      >
                        {voice.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Theme Selection */}
                <div>
                  <label className="text-xs uppercase tracking-widest font-bold text-secondary mb-3 block">Tuỳ chỉnh màu sắc (Theme)</label>
                  
                  {/* Preset Themes */}
                  <div className="flex flex-wrap gap-3 mb-6">
                    {[
                        // TÔNG XANH DƯƠNG (Mặc định giữ nguyên phong cách phối)
                      { name: 'Mặc định', colors: { primary: '#1a365d', secondary: '#b7914b', bg: '#fcfcf9', surface: '#ffffff', text: '#2d3748' } },
                      { name: 'Đại dương', colors: { primary: '#2b6cb0', secondary: '#319795', bg: '#ebf8ff', surface: '#ffffff', text: '#2a4365' } },
                      { name: 'Mây Trời', colors: { primary: '#0284c7', secondary: '#38bdf8', bg: '#f0f9ff', surface: '#ffffff', text: '#0c4a6e' } },

                      // TÔNG XANH LÁ & TEAL
                      { name: 'Bạc Hà', colors: { primary: '#0d9488', secondary: '#5eead4', bg: '#f0fdfa', surface: '#ffffff', text: '#134e4a' } },
                      { name: 'Chanh Sả', colors: { primary: '#059669', secondary: '#f59e0b', bg: '#ecfdf5', surface: '#ffffff', text: '#064e3b' } },
                      { name: 'Rừng xanh', colors: { primary: '#2f855a', secondary: '#975a16', bg: '#f0fff4', surface: '#ffffff', text: '#22543d' } },

                      // TÔNG VÀNG & CAM
                      { name: 'Cổ điển', colors: { primary: '#744210', secondary: '#d69e2e', bg: '#fefcbf', surface: '#ffffff', text: '#5f370e' } },
                      { name: 'Mùa thu', colors: { primary: '#9c4221', secondary: '#d97706', bg: '#fffaf0', surface: '#ffffff', text: '#451a03' } },
                      { name: 'Bình Minh', colors: { primary: '#ea580c', secondary: '#fbbf24', bg: '#fffbeb', surface: '#ffffff', text: '#7c2d12' } },

                      // TÔNG ĐỎ & HỒNG
                      { name: 'Hoàng hôn', colors: { primary: '#c53030', secondary: '#dd6b20', bg: '#fff5f5', surface: '#ffffff', text: '#742a2a' } },
                      { name: 'Hoa anh đào', colors: { primary: '#b83280', secondary: '#f687b3', bg: '#fff5f7', surface: '#ffffff', text: '#702459' } },

                      // TÔNG TÍM
                      { name: 'Kẹo Ngọt', colors: { primary: '#7c3aed', secondary: '#ec4899', bg: '#fdf2f8', surface: '#ffffff', text: '#4c1d95' } },
                      { name: 'Oải hương', colors: { primary: '#553c9a', secondary: '#b794f4', bg: '#f9f5ff', surface: '#ffffff', text: '#44337a' } },

                      // THEME ĐẶC BIỆT
                      { name: 'Hố Đen', colors: { primary: '#6366f1', secondary: '#14b8a6', bg: '#0f172a', surface: '#1e293b', text: '#f1f5f9' } },                    
                      
                      ].map((preset, idx) => (
                      <button
                        key={idx}
                        onClick={() => setTheme(preset.colors)}
                        title={preset.name}
                        className={`w-10 h-10 rounded-full border-2 shadow-sm hover:scale-110 active:scale-95 transition-transform ${
                          theme.primary === preset.colors.primary ? 'border-secondary scale-110' : 'border-white'
                        }`}
                        style={{ backgroundColor: preset.colors.primary }}
                      />
                    ))}
                  </div>

                  <div className="space-y-3">
                    {[
                      { key: 'primary', label: 'Màu chính (Primary)' },
                      { key: 'secondary', label: 'Màu phụ (Secondary)' },
                      { key: 'bg', label: 'Màu nền (Background)' },
                      { key: 'surface', label: 'Màu thẻ (Surface)' },
                      { key: 'text', label: 'Màu chữ (Text)' },
                    ].map(color => (
                      <div key={color.key} className="flex items-center justify-between bg-surface-container-low/50 backdrop-blur-md border border-outline-variant/20 rounded-xl p-3">
                        <span className="text-sm font-medium text-primary">{color.label}</span>
                        <div className="flex items-center gap-3">
                          <input 
                            type="text" 
                            value={theme[color.key as keyof typeof theme]}
                            onChange={(e) => setTheme(prev => ({ ...prev, [color.key]: e.target.value }))}
                            className="w-24 text-sm p-1.5 border border-outline-variant/30 rounded-lg uppercase text-center glass-panel text-on-surface"
                          />
                          <input 
                            type="color" 
                            value={theme[color.key as keyof typeof theme]}
                            onChange={(e) => setTheme(prev => ({ ...prev, [color.key]: e.target.value }))}
                            className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                          />
                        </div>
                      </div>
                    ))}
                    <button 
                      onClick={() => {
                        setTheme({
                          primary: '#1a365d',
                          secondary: '#b7914b',
                          bg: '#fcfcf9',
                          surface: '#ffffff',
                          text: '#2d3748'
                        });
                        setFontFamily('"Manrope", sans-serif');
                        setBaseFontSize(16);
                        setTtsVoice('vi-VN-Standard-A');
                        setReduceEffects(false);
                      }}
                      className="w-full mt-4 py-3 rounded-xl border border-outline-variant/30 text-sm text-primary hover:bg-primary hover:text-on-primary transition-all active:scale-95 font-bold"
                    >
                      Khôi phục mặc định
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmModal.isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200] backdrop-blur-sm bg-black/20"
              onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
            />
            <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 pointer-events-none">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="relative glass-panel p-6 md:p-8 rounded-3xl max-w-sm w-full pointer-events-auto"
              >
                <h3 className="text-xl font-bold text-primary mb-2">{confirmModal.title}</h3>
                <p className="text-on-surface-variant mb-8">{confirmModal.message}</p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                    className="px-5 py-2.5 rounded-xl font-bold text-on-surface-variant hover:bg-surface-container-low/50 backdrop-blur-md transition-colors active:scale-95"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={() => {
                      confirmModal.onConfirm();
                      setConfirmModal(prev => ({ ...prev, isOpen: false }));
                    }}
                    className="px-5 py-2.5 rounded-xl font-bold bg-error text-on-error hover:bg-error/90 transition-colors active:scale-95 shadow-sm"
                  >
                    Xóa
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Question Detail Modal */}
      <AnimatePresence>
        {selectedDetailQuestion && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] backdrop-blur-sm"
              onClick={() => setSelectedDetailQuestion(null)}
            />
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 pointer-events-none">
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="relative glass-panel p-6 md:p-10 rounded-[40px] max-w-2xl w-full max-h-[90vh] overflow-y-auto no-scrollbar pointer-events-auto"
              >
                <div className="flex justify-between items-start mb-8">
                  <div className="space-y-1">
                    <span className="text-xs uppercase tracking-widest font-bold text-secondary">{selectedDetailQuestion.topic}</span>
                    <div className="text-xl md:text-2xl font-bold text-primary leading-relaxed">
                      <ReactMarkdown>{selectedDetailQuestion.question}</ReactMarkdown>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSelectedDetailQuestion(null)}
                    className="p-2 hover:bg-surface-container-low/50 backdrop-blur-md active:scale-95 rounded-full transition-all text-on-surface-variant hover:text-primary flex-shrink-0"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="space-y-8">
                  {(selectedDetailQuestion.type === 'multiple-choice' || selectedDetailQuestion.type === 'multiple-select') && selectedDetailQuestion.options && (
                    <div>
                      <label className="text-xs uppercase tracking-widest font-bold text-secondary mb-4 block">Các lựa chọn</label>
                      <div className="grid grid-cols-1 gap-3">
                        {selectedDetailQuestion.options.map((option, idx) => {
                          const letter = String.fromCharCode(65 + idx);
                          const correctAnsUpper = selectedDetailQuestion.correctAnswer.trim().toUpperCase();
                          let isCorrect = false;
                          
                          if (selectedDetailQuestion.type === 'multiple-select') {
                            const correctAnsArray = correctAnsUpper.split(',').map(s => {
                              const match = s.trim().match(/^[A-F]/);
                              return match ? match[0] : '';
                            }).filter(Boolean);
                            isCorrect = correctAnsArray.includes(letter);
                          } else {
                            if (
                              correctAnsUpper.startsWith(letter + '.') || 
                              correctAnsUpper.startsWith(letter + ':') || 
                              correctAnsUpper.startsWith(letter + ')') || 
                              correctAnsUpper.startsWith(letter + ' ') || 
                              correctAnsUpper === letter
                            ) {
                              isCorrect = true;
                            } else {
                              const cleanOptionText = option.trim().toUpperCase().replace(/^[A-D][.:)]?\s*/, '');
                              const cleanCorrectAns = correctAnsUpper.replace(/^[A-D][.:)]?\s*/, '');
                              if (
                                cleanOptionText === cleanCorrectAns ||
                                cleanOptionText.includes(cleanCorrectAns) ||
                                cleanCorrectAns.includes(cleanOptionText)
                              ) {
                                isCorrect = true;
                              } else if (!isCorrect && /^[A-D]$/.test(correctAnsUpper.charAt(0))) {
                                isCorrect = letter === correctAnsUpper.charAt(0);
                              }
                            }
                          }

                          return (
                            <div 
                              key={idx}
                              className={`p-4 rounded-2xl border-2 flex items-center gap-4 ${
                                isCorrect 
                                  ? 'bg-green-50 border-green-200 text-green-900' 
                                  : 'bg-background border-transparent text-on-surface/80'
                              }`}
                            >
                              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                isCorrect ? 'bg-green-600 text-white' : 'bg-surface-container-low/50 backdrop-blur-md text-primary'
                              }`}>
                                {letter}
                              </span>
                              <div className="text-base flex-1">
                                <ReactMarkdown>{option}</ReactMarkdown>
                              </div>
                              {isCorrect && <CheckCircle2 className="w-5 h-5 ml-auto text-green-600" />}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-xs uppercase tracking-widest font-bold text-secondary mb-4 block">
                      {(selectedDetailQuestion.type === 'multiple-choice' || selectedDetailQuestion.type === 'multiple-select') ? 'Đáp án đúng' : 'Đáp án gợi ý'}
                    </label>
                    <div className="p-6 bg-surface-container-low/50 backdrop-blur-md rounded-2xl border border-outline-variant/20 text-primary font-bold text-lg">
                      {selectedDetailQuestion.correctAnswer}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs uppercase tracking-widest font-bold text-secondary mb-4 block">Giải thích Thần học</label>
                    <div className="prose prose-lg max-w-none italic text-on-surface/90 leading-relaxed bg-surface-container-low/50 backdrop-blur-md p-6 rounded-2xl border border-outline-variant/10">
                      <ReactMarkdown>{selectedDetailQuestion.explanation}</ReactMarkdown>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-outline-variant/20 flex justify-between items-center">
                    <div className="text-xs text-on-surface-variant/60 font-medium italic">
                      Lưu vào: {new Date(selectedDetailQuestion.savedAt || '').toLocaleString('vi-VN')}
                    </div>
                    <div className="flex items-center gap-4">
                      {savedQuestions.some(q => q.id === selectedDetailQuestion.id) ? (
                        <button
                          onClick={() => {
                            moveSavedToKnown(selectedDetailQuestion);
                            setSelectedDetailQuestion(null);
                          }}
                          className="flex items-center gap-2 text-green-600 hover:text-green-700 font-bold text-sm transition-all active:scale-95"
                        >
                          <CheckCircle2 className="w-4 h-4" /> Chuyển sang kho Đã biết
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            moveKnownToSaved(selectedDetailQuestion);
                            setSelectedDetailQuestion(null);
                          }}
                          className="flex items-center gap-2 text-orange-600 hover:text-orange-700 hover:bg-orange-100 font-bold text-sm transition-all active:scale-95"
                        >
                          <HelpCircle className="w-4 h-4" /> Chuyển sang kho Chưa biết
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (savedQuestions.some(q => q.id === selectedDetailQuestion.id)) {
                            deleteSavedQuestion(selectedDetailQuestion.id!);
                          } else {
                            deleteKnownQuestion(selectedDetailQuestion.id!);
                          }
                          setSelectedDetailQuestion(null);
                        }}
                        className="flex items-center gap-2 text-red-600 hover:text-red-700 font-bold text-sm transition-all active:scale-95"
                      >
                        <Trash2 className="w-4 h-4" /> Xoá khỏi danh sách
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Success Modal */}
      <AnimatePresence>
        {showSuccess && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] backdrop-blur-sm bg-black/20"
              onClick={() => setShowSuccess(false)}
            />
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 pointer-events-none">
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="relative glass-panel p-8 md:p-12 rounded-[40px] max-w-md w-full text-center pointer-events-auto flex flex-col items-center gap-6"
              >
                <div className="bg-green-100 p-6 rounded-full">
                  <CheckCircle2 className="w-16 h-16 text-green-600" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold text-green-800">Chúc mừng bạn đã hoàn thành!</h3>
                  <div className="text-green-700 text-lg markdown-body">
                    <ReactMarkdown>{successMessage}</ReactMarkdown>
                  </div>
                </div>
                <button 
                  onClick={() => setShowSuccess(false)} 
                  className="mt-4 px-8 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-full active:scale-95 transition-all shadow-md hover:shadow-lg"
                >
                  Đóng
                </button>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Sticky Progress Bar */}
      <AnimatePresence>
        {isStarted && (
          <motion.div
            id="progress-bar-container"
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className={`fixed top-6 left-1/2 -translate-x-1/2 z-[60] glass-panel rounded-2xl py-4 flex flex-col gap-2 ${!customProgressWidth ? 'w-[92%] md:w-[85%] max-w-3xl' : ''}`}
            style={customProgressWidth ? { width: `${customProgressWidth}px` } : {}}
          >
            {/* Left Drag Handle */}
            <div 
              className="absolute left-0 top-0 bottom-0 w-4 cursor-ew-resize flex items-center justify-center group z-10"
              onMouseDown={(e) => handleResizeStart(e, 'left')}
              title="Kéo để thay đổi độ rộng"
            >
              <div className="w-1 h-8 bg-outline-variant/20 rounded-full group-hover:bg-primary/50 transition-colors" />
            </div>

            {/* Right Drag Handle */}
            <div 
              className="absolute right-0 top-0 bottom-0 w-4 cursor-ew-resize flex items-center justify-center group z-10"
              onMouseDown={(e) => handleResizeStart(e, 'right')}
              title="Kéo để thay đổi độ rộng"
            >
              <div className="w-1 h-8 bg-outline-variant/20 rounded-full group-hover:bg-primary/50 transition-colors" />
            </div>

            <div className="flex justify-between items-center px-5">
              <span className="text-[11px] font-bold text-outline uppercase tracking-widest">
                Tiến độ làm bài
              </span>
              <span className="text-sm font-bold text-primary">
                {quiz.userAnswers.filter(a => a?.trim()).length} / {quiz.targetQuestionCount || quiz.sessionQuestions.length}
              </span>
            </div>
            <div className="flex gap-1 w-full h-2 px-5">
              {Array.from({ length: quiz.targetQuestionCount || quiz.sessionQuestions.length }).map((_, idx) => {
                const isGenerating = idx >= quiz.sessionQuestions.length;
                const isAnswered = !!quiz.userAnswers[idx]?.trim();
                const evaluationResult = quiz.evaluatedResults[idx];
                const isCurrent = (questionType === 'multiple-choice' || questionType === 'multiple-select')
                  ? idx === quiz.currentIndex 
                  : idx === focusedEssayIndex;
                
                let bgColor = "bg-outline-variant/30";
                if (isGenerating) bgColor = "bg-tertiary/30 animate-pulse";
                else if (evaluationResult === true) bgColor = "bg-primary";
                else if (evaluationResult === false) bgColor = "bg-error";
                else if (isAnswered) bgColor = "bg-primary/60";
                else if (isCurrent) bgColor = "bg-primary/40 animate-pulse";

                return (
                  <button 
                    key={idx} 
                    onClick={() => !isGenerating && goToQuestion(idx)}
                    disabled={isGenerating}
                    className={`flex-1 rounded-full transition-all duration-300 hover:scale-y-150 active:scale-95 ${isGenerating ? 'cursor-not-allowed' : 'cursor-pointer'} ${bgColor}`}
                    title={isGenerating ? `Câu ${idx + 1} (Đang tạo...)` : `Câu ${idx + 1}`}
                  />
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="absolute top-0 right-0 z-50 pointer-events-none w-full">
        <div className="flex justify-end items-center px-4 py-4 gap-4 relative pointer-events-auto">
          <div className="flex items-center gap-4 bg-surface/80 backdrop-blur-md py-2 px-6 rounded-full shadow-sm border border-outline-variant/20 mr-12">
            <div className="flex items-center gap-2 text-primary">
              <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden">
                {user?.photoURL ? (
                  <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <Users className="w-3 h-3 text-primary" />
                )}
              </div>
              <span className="text-sm font-bold truncate max-w-[150px]">{user?.displayName || user?.email?.split('@')[0]}</span>
            </div>
            <div className="w-px h-4 bg-outline-variant/30"></div>
            <button
               onClick={async () => { await logout(); }}
               className="text-xs text-error font-bold hover:underline"
            >
              Đăng xuất
            </button>
          </div>
          {/* Hidden Entry Button (Click to open hidden settings) */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="w-12 h-12 opacity-0 cursor-default absolute top-0 right-0"
            title="Cài đặt hệ thống"
          >
          </button>
        </div>
      </header>

      {!isStarted ? (
        quiz.loading ? (
          <main className="max-w-3xl mx-auto flex flex-col items-center justify-center min-h-[60vh] pt-10">
            <RefreshCw className="w-24 h-24 mx-auto mb-8 text-primary animate-spin opacity-80" />
            <h2 className="text-2xl font-bold mb-4 text-on-surface text-center text-balance">{loadingMessage}</h2>
            <p className="text-lg text-on-surface-variant mb-8 text-center text-balance">Vui lòng đợi trong giây lát.</p>
            <div className="flex flex-col sm:flex-row items-center gap-4">
              {quiz.sessionQuestions.length > 0 && (
                <button 
                  onClick={() => {
                    setQuiz(prev => ({ ...prev, loading: false }));
                    setIsStarted(true);
                    setTimeout(() => {
                      questionTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 100);
                  }}
                  className="px-8 py-4 bg-primary text-on-primary rounded-full font-bold hover:bg-primary/90 transition-all active:scale-95 shadow-lg flex items-center gap-2"
                >
                  <span>Làm bài luôn ({quiz.sessionQuestions.length}/{quiz.targetQuestionCount} câu)</span>
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={() => {
                  setQuiz(prev => ({ 
                    ...prev, 
                    loading: false, 
                    sessionQuestions: [], 
                    currentQuestion: null,
                    userAnswers: [],
                    evaluatedResults: [],
                    essayEvaluations: []
                  }));
                }}
                className="px-8 py-4 bg-surface-container-high text-on-surface rounded-full font-bold hover:bg-surface-container-highest transition-all active:scale-95 shadow-sm flex items-center gap-2"
              >
                <X className="w-5 h-5" />
                <span>Thoát về màn hình chính</span>
              </button>
            </div>
          </main>
        ) : (
        <main className="max-w-[1440px] mx-auto px-6 pt-10 pb-32 space-y-8">
          {/* Hero Title Section */}
          <section className="mb-12 text-center">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-secondary mb-4 block">Thiết lập lộ trình</span>
            <h2 className="text-4xl md:text-5xl font-extrabold font-headline text-primary tracking-tight">CÀI ĐẶT CÂU HỎI</h2>
            <div className="w-16 h-1 bg-secondary mx-auto mt-6 rounded-full"></div>
          </section>
          <div className="grid grid-cols-1 gap-8">
            {/* Mode & Level Selection Grid */}
            <div className="grid xl:grid-cols-2 gap-8">
              {/* Chế độ ôn tập Card */}
              <div className="glass-panel p-10 rounded-3xl border-none flex flex-col">
                <h3 className="text-[11px] font-bold text-on-tertiary-fixed-variant uppercase tracking-widest mb-8 text-center">CHẾ ĐỘ ÔN TẬP</h3>
                <div className="flex flex-col sm:flex-row gap-4 flex-1">
                  {[
                    { id: 'new', label: 'Câu hỏi mới (AI)', icon: PlusCircle },
                    { id: 'old', label: 'Câu hỏi chưa biết', icon: History },
                    { id: 'both', label: 'Kết hợp cả hai', icon: BookMarked }
                  ].map(item => (
                    <label
                      key={item.id}
                      className={`flex-1 flex flex-col items-center justify-center text-center p-4 rounded-xl cursor-pointer shadow-lg active:scale-95 transition-all duration-200 ${
                        mode === item.id 
                          ? 'bg-primary text-on-primary shadow-lg' 
                          : 'bg-surface-container-low/50 backdrop-blur-md text-on-surface-variant hover:bg-surface-container hover:text-primary border border-transparent hover:border-outline-variant/30'
                      }`}
                    >
                      <input 
                        type="radio" 
                        name="mode" 
                        className="hidden" 
                        checked={mode === item.id}
                        onChange={() => setMode(item.id as any)}
                      />
                      <item.icon className="w-8 h-8 mb-3" />
                      <span className="font-bold text-sm">{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Mức độ Card */}
              <div className="glass-panel p-10 rounded-3xl border-none flex flex-col">
                <h3 className="text-[11px] font-bold text-on-tertiary-fixed-variant uppercase tracking-widest mb-8 text-center">MỨC ĐỘ</h3>
                <div className="flex flex-col gap-4 flex-1 justify-center">
                  <div className="flex flex-wrap justify-center gap-4">
                    {['Ấu nhi', 'Thiếu nhi', 'Nghĩa Sỹ'].map(level => {
                      const colors: Record<string, string> = {
                        'Ấu nhi': 'border-green-500 bg-green-100 text-green-900',
                        'Thiếu nhi': 'border-blue-500 bg-blue-100 text-blue-900',
                        'Nghĩa Sỹ': 'border-yellow-500 bg-yellow-100 text-yellow-900'
                      };
                      return (
                        <button
                          key={level}
                          onClick={() => setQuizLevel(level as QuizLevel)}
                          className={`flex-1 min-w-[100px] sm:min-w-[120px] flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all active:scale-95 ${
                            quizLevel === level 
                              ? `${colors[level]} shadow-md` 
                              : 'bg-surface-container-low/50 backdrop-blur-md text-on-surface-variant border-transparent hover:border-outline-variant hover:bg-surface-container'
                          }`}
                        >
                          <span className="text-[11px] font-bold uppercase tracking-wider">{level}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap justify-center gap-4">
                    {['Hiệp Sỹ', 'Huynh Trưởng'].map(level => {
                      const colors: Record<string, string> = {
                        'Hiệp Sỹ': 'border-amber-700 bg-amber-100 text-amber-900',
                        'Huynh Trưởng': 'border-red-500 bg-red-100 text-red-900'
                      };
                      return (
                        <button
                          key={level}
                          onClick={() => setQuizLevel(level as QuizLevel)}
                          className={`flex-1 min-w-[100px] sm:min-w-[120px] flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all active:scale-95 ${
                            quizLevel === level 
                              ? `${colors[level]} shadow-md` 
                              : 'bg-surface-container-low/50 backdrop-blur-md text-on-surface-variant border-transparent hover:border-outline-variant hover:bg-surface-container'
                          }`}
                        >
                          <span className="text-[11px] font-bold uppercase tracking-wider">{level}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Loại câu hỏi & Số lượng Card */}
            <div className="glass-panel p-10 rounded-3xl border-none">
              <div className="grid xl:grid-cols-2 gap-12 items-center">
                <div>
                  <h3 className="text-[11px] font-bold text-on-tertiary-fixed-variant uppercase tracking-widest mb-8 text-center lg:text-left">LOẠI CÂU HỎI</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:gap-4">
                    <label className="flex flex-col text-center cursor-pointer active:scale-95 transition-transform">
                      <input 
                        type="radio" 
                        name="questionType" 
                        className="hidden peer" 
                        checked={questionType === 'multiple-choice'}
                        onChange={() => setQuestionType('multiple-choice')}
                      />
                      <div className="h-full p-4 rounded-xl bg-surface-container-low/50 backdrop-blur-md text-on-surface-variant peer-checked:bg-primary/10 peer-checked:text-primary border-2 border-transparent peer-checked:border-primary/20 transition-all shadow-sm flex flex-col items-center justify-center gap-2">
                        <CheckSquare className="w-5 h-5 lg:w-6 lg:h-6 shrink-0" />
                        <span className="text-[11px] sm:text-xs xl:text-sm font-bold text-balance">Trắc nghiệm</span>
                      </div>
                    </label>
                    <label className="flex flex-col text-center cursor-pointer active:scale-95 transition-transform">
                      <input 
                        type="radio" 
                        name="questionType" 
                        className="hidden peer" 
                        checked={questionType === 'multiple-select'}
                        onChange={() => setQuestionType('multiple-select')}
                      />
                      <div className="h-full p-4 rounded-xl bg-surface-container-low/50 backdrop-blur-md text-on-surface-variant peer-checked:bg-primary/10 peer-checked:text-primary border-2 border-transparent peer-checked:border-primary/20 transition-all shadow-sm flex flex-col items-center justify-center gap-2">
                        <ListChecks className="w-5 h-5 lg:w-6 lg:h-6 shrink-0" />
                        <span className="text-[11px] sm:text-xs xl:text-sm font-bold text-balance">Nhiều đáp án</span>
                      </div>
                    </label>
                    <label className="flex flex-col text-center cursor-pointer active:scale-95 transition-transform">
                      <input 
                        type="radio" 
                        name="questionType" 
                        className="hidden peer" 
                        checked={questionType === 'short-essay'}
                        onChange={() => setQuestionType('short-essay')}
                      />
                      <div className="h-full p-4 rounded-xl bg-surface-container-low/50 backdrop-blur-md text-on-surface-variant peer-checked:bg-primary/10 peer-checked:text-primary border-2 border-transparent peer-checked:border-primary/20 transition-all shadow-sm flex flex-col items-center justify-center gap-2">
                        <AlignLeft className="w-5 h-5 lg:w-6 lg:h-6 shrink-0" />
                        <span className="text-[11px] sm:text-xs xl:text-sm font-bold text-balance">Tự luận ngắn</span>
                      </div>
                    </label>
                    <label className="flex flex-col text-center cursor-pointer active:scale-95 transition-transform">
                      <input 
                        type="radio" 
                        name="questionType" 
                        className="hidden peer" 
                        checked={questionType === 'long-essay'}
                        onChange={() => setQuestionType('long-essay')}
                      />
                      <div className="h-full p-4 rounded-xl bg-surface-container-low/50 backdrop-blur-md text-on-surface-variant peer-checked:bg-primary/10 peer-checked:text-primary border-2 border-transparent peer-checked:border-primary/20 transition-all shadow-sm flex flex-col items-center justify-center gap-2">
                        <AlignJustify className="w-5 h-5 lg:w-6 lg:h-6 shrink-0" />
                        <span className="text-[11px] sm:text-xs xl:text-sm font-bold text-balance">Tự luận dài</span>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="px-3">
                  <div className="flex justify-between items-center mb-8 -mx-3">
                    <h3 className="text-[11px] font-bold text-on-tertiary-fixed-variant uppercase tracking-widest text-center lg:text-left">SỐ LƯỢNG CÂU</h3>
                    <input 
                      type="number" 
                      min="1"
                      value={questionCount || ''} 
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setQuestionCount(isNaN(val) ? 0 : val);
                      }}
                      onBlur={() => {
                        if (!questionCount || questionCount < 1) setQuestionCount(1);
                      }}
                      className="w-20 text-right text-2xl font-black font-headline text-primary bg-transparent border-b-2 border-transparent hover:border-primary/30 focus:border-primary focus:outline-none transition-colors"
                    />
                  </div>
                  <div className="relative w-full h-2 bg-surface-variant rounded-full mb-4">
                    <input 
                      type="range" 
                      min="1" 
                      max="40" 
                      value={Math.max(1, Math.min(questionCount, 40))} 
                      onChange={(e) => setQuestionCount(parseInt(e.target.value))}
                      className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div 
                      className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-background to-primary to-60% rounded-full"
                      style={{ clipPath: `inset(0 ${100 - ((Math.max(1, Math.min(questionCount, 40)) - 1) / 39) * 100}% 0 0)` }}
                    ></div>
                    <div 
                      className="absolute top-1/2 w-6 h-6 bg-white border-2 border-primary rounded-full shadow-xl  pointer-events-none"
                      style={{ 
                        left: `${((Math.max(1, Math.min(questionCount, 40)) - 1) / 39) * 100}%`,
                        transform: 'translate(-50%, -50%)'
                      }}
                    ></div>
                  </div>
                  <div className="relative w-full h-4 mt-4 text-[11px] text-outline font-bold">
                    {[1, 10, 20, 30, 40].map((val) => (
                      <span 
                        key={val} 
                        className="absolute top-0 -translate-x-1/2"
                        style={{ left: `${((val - 1) / 39) * 100}%` }}
                      >
                        {val}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Topic Selection */}
            <div className="glass-panel p-10 rounded-3xl border-none">
              <h3 className="text-[11px] font-bold text-on-tertiary-fixed-variant uppercase tracking-widest mb-8 text-center">CHỦ ĐỀ HỌC TẬP</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-h-[400px] overflow-y-auto no-scrollbar pb-4 items-stretch">
                <label className="group flex items-center justify-between p-4 xl:p-5 rounded-xl bg-surface-container-low/50 backdrop-blur-md hover:bg-surface-container transition-all active:scale-[0.98] cursor-pointer border border-transparent hover:border-outline-variant/30">
                  <div className="flex items-center gap-3 pr-2">
                    <div className="p-2 rounded-lg glass-panel text-primary shadow-sm">
                      <BookMarked className="w-5 h-5" />
                    </div>
                    <span className="font-bold text-sm">Tất cả chủ đề</span>
                  </div>
                  <div className={`w-6 h-6 shrink-0 rounded-md border-2 flex items-center justify-center transition-all shadow-sm ${
                    !isCustomTopic && selectedTopics.length === TOPICS.length 
                      ? 'bg-primary border-primary' 
                      : 'border-outline-variant'
                  }`}>
                    <input 
                      type="checkbox"
                      checked={!isCustomTopic && selectedTopics.length === TOPICS.length}
                      onChange={(e) => {
                        setIsCustomTopic(false);
                        if (e.target.checked) {
                          setSelectedTopics([...TOPICS]);
                        } else {
                          setSelectedTopics([]);
                        }
                      }}
                      className="hidden"
                    />
                    {(!isCustomTopic && selectedTopics.length === TOPICS.length) && <CheckCircle2 className="w-4 h-4 text-white" />}
                  </div>
                </label>
                
                {TOPICS.map(t => {
                  const Icon = TOPIC_ICONS[t] || BookOpen;
                  return (
                  <label key={t} className="group flex items-center justify-between p-4 xl:p-5 rounded-xl bg-surface-container-low/50 backdrop-blur-md hover:bg-surface-container transition-all active:scale-[0.98] cursor-pointer border border-transparent hover:border-outline-variant/30">
                    <div className="flex items-center gap-3 pr-2">
                      <div className="p-2 rounded-lg glass-panel text-primary shadow-sm">
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="font-bold text-sm">{t}</span>
                    </div>
                    <div className={`w-6 h-6 shrink-0 rounded-md border-2 flex items-center justify-center transition-all shadow-sm ${
                      !isCustomTopic && selectedTopics.includes(t)
                        ? 'bg-primary border-primary' 
                        : 'border-outline-variant'
                    }`}>
                      <input 
                        type="checkbox"
                        checked={!isCustomTopic && selectedTopics.includes(t)}
                        onChange={(e) => {
                          setIsCustomTopic(false);
                          if (e.target.checked) {
                            setSelectedTopics(prev => [...prev, t]);
                          } else {
                            setSelectedTopics(prev => prev.filter(item => item !== t));
                          }
                        }}
                        className="hidden"
                      />
                      {(!isCustomTopic && selectedTopics.includes(t)) && <CheckCircle2 className="w-4 h-4 text-white" />}
                    </div>
                  </label>
                )})}
              </div>
              
              <div className="mt-6 space-y-3">
                <button
                  onClick={() => setIsCustomTopic(!isCustomTopic)}
                  className={`w-full px-4 py-4 rounded-xl text-sm font-bold transition-all active:scale-[0.98] border ${
                    isCustomTopic 
                      ? 'bg-secondary/10 text-secondary border-secondary/20 shadow-md' 
                      : 'bg-surface-container-low/50 backdrop-blur-md text-on-surface-variant border-transparent hover:border-outline-variant hover:bg-surface-container'
                  }`}
                >
                  {isCustomTopic ? '✓ Đang dùng chủ đề tự chọn' : '+ Thêm chủ đề tự chọn'}
                </button>

                {isCustomTopic && (
                  <motion.input 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    type="text"
                    value={customTopic}
                    onChange={(e) => setCustomTopic(e.target.value)}
                    placeholder="Nhập chủ đề bạn muốn..."
                    className="w-full glass-panel border border-outline-variant/30 rounded-xl px-4 py-4 text-base font-medium focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-on-surface"
                  />
                )}
              </div>
            </div>

            {/* Start Button */}
            <div className="mt-4 flex justify-center">
              <button
                onClick={startSession}
                disabled={quiz.loading}
                className="w-full lg:max-w-2xl bg-primary text-on-primary shadow-lg py-6 rounded-full font-headline font-extrabold text-xl flex items-center justify-center gap-4 transition-all hover:scale-[1.02] active:scale-[0.98] group disabled:opacity-50 disabled:hover:scale-100 disabled:active:scale-100"
              >
                {quiz.loading ? <RefreshCw className="w-6 h-6 animate-spin" /> : 'BẮT ĐẦU ÔN TẬP NGAY'}
                {!quiz.loading && <ChevronRight className="w-6 h-6 transition-transform group-hover:translate-x-2" />}
              </button>
            </div>
          </div>

          {/* Saved Questions Lists */}
          <section className="space-y-6" ref={errorViewRef}>
            {quiz.error && (
              <p className="mb-6 text-error font-bold text-sm flex items-center gap-2 bg-error-container text-on-error-container p-4 rounded-xl border border-error/20">
                <AlertCircle className="w-5 h-5" /> {quiz.error}
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="glass-panel p-8 rounded-3xl border-none flex flex-col">
                <button 
                  onClick={() => setIsSavedQuestionsOpen(!isSavedQuestionsOpen)}
                  className="w-full text-lg font-bold flex items-center justify-between text-on-surface group active:scale-95 transition-transform"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center">
                      <Save className="w-5 h-5" />
                    </div>
                    Kho Chưa biết ({savedQuestions.length} câu) - {calculateSize(savedQuestions)}
                  </div>
                  {isSavedQuestionsOpen ? <ChevronUp className="w-5 h-5 text-outline group-hover:text-on-surface" /> : <ChevronDown className="w-5 h-5 text-outline group-hover:text-on-surface" />}
                </button>
                
                <AnimatePresence>
                  {isSavedQuestionsOpen && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      {savedQuestions.length > 0 && (
                        <div className="flex justify-end mt-8">
                          <button 
                            onClick={() => setConfirmModal({
                              isOpen: true,
                              title: 'Xóa tất cả câu hỏi',
                              message: 'Bạn có chắc chắn muốn xóa tất cả câu hỏi trong kho "Chưa biết"? Hành động này không thể hoàn tác.',
                              onConfirm: clearSavedQuestions
                            })}
                            className="text-error text-[11px] font-bold uppercase tracking-widest flex items-center gap-1 cursor-pointer active:scale-95 transition-transform"
                          >
                            <Trash2 className="w-3 h-3" /> Xoá tất cả
                          </button>
                        </div>
                      )}
                      <div className={`overflow-y-auto no-scrollbar pr-2 max-h-[400px] ${savedQuestions.length > 0 ? 'mt-4' : 'mt-8'}`}>
                        {savedQuestions.length === 0 ? (
                          <div className="text-center py-8">
                            <p className="text-sm italic text-outline">Chưa có câu hỏi nào trong kho 'Chưa biết'.</p>
                          </div>
                        ) : (
                          <AnimatePresence initial={false}>
                            {currentSavedQuestions.map((q, index) => (
                              <motion.div 
                                layout
                                initial={{ opacity: 0, height: 0, scale: 0.9, marginBottom: 0 }}
                                animate={{ opacity: 1, height: "auto", scale: 1, marginBottom: 16 }}
                                exit={{ opacity: 0, height: 0, scale: 0.9, marginBottom: 0 }}
                                transition={{ duration: 0.25, ease: "easeInOut" }}
                                key={q.id} 
                                style={{ overflow: 'hidden' }}
                              >
                                <div
                                  onClick={() => setSelectedDetailQuestion(q)}
                                  className="group relative bg-surface-container-low/50 backdrop-blur-md p-5 rounded-xl text-sm hover:!bg-orange-100 transition-all border border-transparent active:scale-95 active:shadow-inner shadow-sm cursor-pointer"
                                >
                                  <div className="font-bold text-on-surface line-clamp-2 mb-3 leading-snug flex gap-1">
                                    <span>{index + 1}.</span>
                                    <ReactMarkdown components={{ p: 'span' }}>{q.question}</ReactMarkdown>
                                  </div>
                                  <div className="flex justify-between items-center text-[11px] uppercase tracking-widest font-bold text-outline">
                                    <span>{q.topic}</span>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          moveSavedToKnown(q);
                                        }}
                                        title="Chuyển sang kho Đã biết"
                                        className="text-green-600 p-2 hover:bg-green-100 rounded-lg active:scale-95"
                                      >
                                        <CheckCircle2 className="w-4 h-4" />
                                      </button>
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          deleteSavedQuestion(q.id!);
                                        }}
                                        title="Xóa khỏi danh sách"
                                        className="text-error p-2 hover:bg-error-container rounded-lg active:scale-95"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </motion.div>
                            ))}
                          </AnimatePresence>
                        )}
                        {savedQuestions.length > ITEMS_PER_PAGE && (
                          <div className="flex flex-wrap justify-center gap-2 mt-4 pt-4 border-t border-outline-variant/30 pb-2">
                            {Array.from({ length: totalSavedPages }, (_, i) => i + 1).map((page) => (
                              <button
                                key={page}
                                onClick={(e) => { e.stopPropagation(); setSavedPage(page); }}
                                className={`min-w-8 h-8 px-2 rounded-full text-[11px] font-bold transition-all border active:scale-95 ${
                                  savedPage === page 
                                    ? 'bg-orange-500 text-white border-orange-500 shadow-md transform scale-110' 
                                    : 'bg-surface-container text-outline border-outline-variant/30 hover:bg-surface-container-high hover:text-on-surface hover:border-outline'
                                }`}
                              >
                                {page}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="glass-panel p-8 rounded-3xl border-none flex flex-col">
                <button 
                  onClick={() => setIsKnownQuestionsOpen(!isKnownQuestionsOpen)}
                  className="w-full text-lg font-bold flex items-center justify-between text-on-surface group active:scale-95 transition-transform"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    Kho Đã biết ({knownQuestions.length} câu) - {calculateSize(knownQuestions)}
                  </div>
                  {isKnownQuestionsOpen ? <ChevronUp className="w-5 h-5 text-outline group-hover:text-on-surface" /> : <ChevronDown className="w-5 h-5 text-outline group-hover:text-on-surface" />}
                </button>

                <AnimatePresence>
                  {isKnownQuestionsOpen && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      {knownQuestions.length > 0 && (
                        <div className="flex justify-end mt-8">
                          <button 
                            onClick={() => setConfirmModal({
                              isOpen: true,
                              title: 'Xóa tất cả câu hỏi',
                              message: 'Bạn có chắc chắn muốn xóa tất cả câu hỏi trong kho "Đã biết"? Hành động này không thể hoàn tác.',
                              onConfirm: clearKnownQuestions
                            })}
                            className="text-error text-[11px] font-bold uppercase tracking-widest flex items-center gap-1 cursor-pointer active:scale-95 transition-transform"
                          >
                            <Trash2 className="w-3 h-3" /> Xoá tất cả
                          </button>
                        </div>
                      )}
                      <div className={`overflow-y-auto no-scrollbar pr-2 max-h-[400px] ${knownQuestions.length > 0 ? 'mt-4' : 'mt-8'}`}>
                        {knownQuestions.length === 0 ? (
                          <div className="text-center py-8">
                            <p className="text-sm italic text-outline">Chưa có câu hỏi nào trong kho 'Đã biết'.</p>
                          </div>
                        ) : (
                          <AnimatePresence initial={false}>
                            {currentKnownQuestions.map((q, index) => (
                              <motion.div 
                                layout
                                initial={{ opacity: 0, height: 0, scale: 0.9, marginBottom: 0 }}
                                animate={{ opacity: 1, height: "auto", scale: 1, marginBottom: 16 }}
                                exit={{ opacity: 0, height: 0, scale: 0.9, marginBottom: 0 }}
                                transition={{ duration: 0.25, ease: "easeInOut" }}
                                key={q.id} 
                                style={{ overflow: 'hidden' }}
                              >
                                <div
                                  onClick={() => setSelectedDetailQuestion(q)}
                                  className="group relative bg-surface-container-low/50 backdrop-blur-md p-5 rounded-xl text-sm hover:!bg-green-100 transition-all border border-transparent active:scale-95 active:shadow-inner shadow-sm cursor-pointer"
                                >
                                  <div className="font-bold text-on-surface line-clamp-2 mb-3 leading-snug flex gap-1">
                                    <span>{index + 1}.</span>
                                    <ReactMarkdown components={{ p: 'span' }}>{q.question}</ReactMarkdown>
                                  </div>
                                  <div className="flex justify-between items-center text-[11px] uppercase tracking-widest font-bold text-outline">
                                    <span>{q.topic}</span>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          moveKnownToSaved(q);
                                        }}
                                        title="Chuyển sang kho Chưa biết"
                                        className="text-orange-600 p-2 hover:bg-orange-100 rounded-lg active:scale-95"
                                      >
                                        <HelpCircle className="w-4 h-4" />
                                      </button>
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          deleteKnownQuestion(q.id!);
                                        }}
                                        title="Xóa khỏi danh sách"
                                        className="text-error p-2 hover:bg-error-container rounded-lg active:scale-95"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </motion.div>
                            ))}
                          </AnimatePresence>
                        )}
                        {knownQuestions.length > ITEMS_PER_PAGE && (
                          <div className="flex flex-wrap justify-center gap-2 mt-4 pt-4 border-t border-outline-variant/30 pb-2">
                            {Array.from({ length: totalKnownPages }, (_, i) => i + 1).map((page) => (
                              <button
                                key={page}
                                onClick={(e) => { e.stopPropagation(); setKnownPage(page); }}
                                className={`min-w-8 h-8 px-2 rounded-full text-[11px] font-bold transition-all border active:scale-95 ${
                                  knownPage === page 
                                    ? 'bg-green-600 text-white border-green-600 shadow-md transform scale-110' 
                                    : 'bg-surface-container text-outline border-outline-variant/30 hover:bg-surface-container-high hover:text-on-surface hover:border-outline'
                                }`}
                              >
                                {page}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Storage Usage Info */}
              <div 
                onClick={() => setIsProfileManagerOpen(true)}
                className="mt-8 pt-6 border-t border-outline-variant/10 cursor-pointer group"
                title="Nhấn để quản lý Profile"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest font-bold text-outline group-hover:text-primary transition-colors">
                    <Database className="w-3 h-3" />
                    Bộ nhớ - IndexedDB ({profiles.find(p => p.id === currentProfileId)?.name})
                  </div>
                  <span className={`text-[11px] font-bold ${storageUsage.isLow ? 'text-error' : 'text-outline group-hover:text-primary transition-colors'}`}>
                    {storageUsage.percentage}%
                  </span>
                </div>
                <div className="h-1 w-full bg-surface-container-low/50 backdrop-blur-md rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${storageUsage.percentage}%` }}
                    className={`h-full ${storageUsage.isLow ? 'bg-error' : 'bg-primary'}`}
                  />
                </div>
                <div className="flex justify-between mt-2 text-[10px] text-outline italic group-hover:text-primary/70 transition-colors">
                  <span>Đã dùng: {storageUsage.used}</span>
                  <span>Còn trống: {storageUsage.remaining}</span>
                </div>
              </div>
            </div>
          </section>
        </main>
        )
      ) : (
        <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start pt-24">
          {/* Sidebar Info during Quiz */}
          <section className="lg:col-span-3 space-y-6 lg:sticky lg:top-28">
            <div className="glass-panel p-8 rounded-3xl border-none">
              <h3 className="text-[11px] font-bold text-on-tertiary-fixed-variant uppercase tracking-widest mb-8 flex items-center gap-3">
                <History className="w-5 h-5" /> TIẾN ĐỘ
              </h3>
              <div className="space-y-6">
                <div className="flex flex-col xl:flex-row xl:justify-between xl:items-center gap-1 xl:gap-4 text-sm font-bold">
                  <span className="text-outline uppercase tracking-widest text-[11px]">Mức độ</span>
                  <span className="text-on-surface text-left xl:text-right">{quizLevel}</span>
                </div>
                <div className="flex flex-col xl:flex-row xl:justify-between xl:items-center gap-1 xl:gap-4 text-sm font-bold">
                  <span className="text-outline uppercase tracking-widest text-[11px]">Loại câu</span>
                  <span className="text-on-surface text-left xl:text-right">
                    {questionType === 'multiple-choice' ? 'Trắc nghiệm' : 
                     questionType === 'multiple-select' ? 'Nhiều đáp án' :
                     questionType === 'short-essay' ? 'Tự luận ngắn' : 'Tự luận dài'}
                  </span>
                </div>
                <div className="flex flex-col xl:flex-row xl:justify-between xl:items-center gap-1 xl:gap-4 text-sm font-bold">
                  <span className="text-outline uppercase tracking-widest text-[11px]">Số lượng</span>
                  <span className="text-on-surface text-left xl:text-right">{quiz.targetQuestionCount || quiz.sessionQuestions.length} câu</span>
                </div>
                
                <div className="pt-6 border-t border-outline-variant/10 space-y-3">
                  <span className="text-outline uppercase tracking-widest text-[11px] font-bold block">Chủ đề đã chọn</span>
                  <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                    {(isCustomTopic && customTopic.trim() ? [customTopic] : selectedTopics).map((topic) => (
                      <div key={topic} className="flex items-center gap-2 text-xs text-on-surface-variant bg-surface-container-low/50 backdrop-blur-md p-2 rounded-lg border border-outline-variant/10">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary/40 flex-shrink-0" />
                        <span className="leading-relaxed">{topic}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => {
                    setIsStarted(false);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="w-full mt-4 py-4 text-[11px] font-bold text-error hover:bg-error-container hover:text-on-error-container rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 uppercase tracking-widest border border-error/20"
                >
                  <RefreshCw className="w-4 h-4" /> Thoát & Cài đặt lại
                </button>
              </div>
            </div>
          </section>

          {/* Quiz Area */}
          <section className="lg:col-span-9" ref={questionTopRef}>
            <AnimatePresence mode="wait">
              {!quiz.currentQuestion ? (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass-panel p-16 rounded-[40px] shadow-[0_8px_32px_rgba(0,0,0,0.03)] border border-outline-variant/10 text-center h-full flex flex-col justify-center items-center"
                >
                  {quiz.loading ? (
                    <>
                      <RefreshCw className="w-24 h-24 mx-auto mb-8 text-primary animate-spin opacity-80" />
                      <h2 className="text-xl font-bold mb-4 text-on-surface text-balance">Đang tạo bộ câu hỏi..</h2>
                      <p className="text-base text-on-surface-variant mb-10 text-balance">Vui lòng đợi trong giây lát.</p>
                    </>
                  ) : (
                    <>
                      <HelpCircle className="w-24 h-24 mx-auto mb-8 text-secondary opacity-20" />
                      <h2 className="text-xl font-bold mb-4 text-on-surface text-balance">Sẵn sàng chưa?</h2>
                      <p className="text-base text-on-surface-variant mb-10 text-balance">Chọn chủ đề và nhấn <span className="font-bold text-primary">"Bắt đầu ôn tập"</span> để nhận câu hỏi đầu tiên.</p>
                    </>
                  )}
                </motion.div>
              ) : (questionType === 'multiple-choice' || questionType === 'multiple-select') ? (
                <motion.div 
                  key={quiz.currentQuestion.question}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="glass-panel p-8 md:p-12 rounded-[40px] shadow-[0_8px_32px_rgba(0,0,0,0.03)] border border-outline-variant/10 flex flex-col h-full"
                >
                  <div className="flex justify-between items-start mb-6 lg:mb-10 gap-4 flex-col sm:flex-row">
                    <span className={`px-4 py-1.5 rounded-full text-[11px] uppercase tracking-widest font-bold shadow-sm ${
                      quiz.currentQuestion.isNew ? 'bg-primary text-on-primary' : 'bg-secondary text-on-secondary'
                    }`}>
                      {quiz.currentQuestion.isNew ? 'Câu hỏi mới' : 'Câu hỏi cũ'}
                    </span>
                    <span className="text-[11px] font-bold text-outline uppercase tracking-widest sm:text-right">{quiz.currentQuestion.topic}</span>
                  </div>

                  <div className="text-xl md:text-2xl font-bold leading-relaxed mb-12 text-on-surface">
                    <ReactMarkdown>{quiz.currentQuestion.question}</ReactMarkdown>
                    {questionType === 'multiple-select' && (
                      <p className="text-sm text-primary mt-4 font-normal italic">* Câu hỏi này có thể có nhiều đáp án đúng. Hãy chọn tất cả các đáp án bạn cho là đúng.</p>
                    )}
                  </div>

                  <div className="flex-grow space-y-5 mb-12">
                    <div className="grid grid-cols-1 gap-4">
                      {quiz.currentQuestion.options?.map((option, idx) => {
                        const letter = String.fromCharCode(65 + idx);
                        const isSelected = questionType === 'multiple-select' 
                          ? quiz.userAnswer.split(',').map(s => s.trim()).includes(letter)
                          : quiz.userAnswer === letter;
                        
                        let isCorrectOption = false;
                        if (quiz.isEvaluated && questionType === 'multiple-select') {
                          const correctAnsUpper = quiz.currentQuestion.correctAnswer.trim().toUpperCase();
                          const correctAnsArray = correctAnsUpper.split(',').map(s => {
                            const match = s.trim().match(/^[A-F]/);
                            return match ? match[0] : '';
                          }).filter(Boolean);
                          isCorrectOption = correctAnsArray.includes(letter);
                        }

                        let buttonClass = `text-left p-6 rounded-2xl border-2 transition-all flex items-center gap-6 text-base font-medium active:scale-[0.98] `;
                        
                        if (isSelected) {
                          buttonClass += `bg-primary text-on-primary shadow-lg scale-[1.02] `;
                          if (isCorrectOption) {
                            buttonClass += `!border-green-500`;
                          } else {
                            buttonClass += `border-primary `;
                          }
                        } else {
                          buttonClass += `bg-surface-container-low/50 backdrop-blur-md hover:bg-surface-container text-on-surface `;
                          if (isCorrectOption) {
                            buttonClass += `!border-green-500`;
                          } else {
                            buttonClass += `border-transparent hover:border-outline-variant/30 `;
                          }
                        }

                        if (quiz.isEvaluated) {
                           buttonClass += `opacity-90 cursor-default active:scale-100 `;
                        }

                        return (
                          <button
                            key={idx}
                            disabled={quiz.isEvaluated}
                            onClick={() => {
                              if (questionType === 'multiple-select') {
                                setQuiz(prev => {
                                  const currentAnswers = prev.userAnswer ? prev.userAnswer.split(',').map(s => s.trim()).filter(Boolean) : [];
                                  if (currentAnswers.includes(letter)) {
                                    return { ...prev, userAnswer: currentAnswers.filter(a => a !== letter).sort().join(', ') };
                                  } else {
                                    return { ...prev, userAnswer: [...currentAnswers, letter].sort().join(', ') };
                                  }
                                });
                              } else {
                                setQuiz(prev => ({ ...prev, userAnswer: letter }));
                              }
                            }}
                            className={buttonClass}
                          >
                            <span className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold shrink-0 ${
                              isSelected ? 'bg-white/20' : 'glass-panel text-primary border border-outline-variant/30'
                            }`}>
                              {questionType === 'multiple-select' ? (
                                isSelected ? <CheckSquare className="w-6 h-6" /> : letter
                              ) : letter}
                            </span>
                            <div className="flex-1">
                              <ReactMarkdown>{option}</ReactMarkdown>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {quiz.isEvaluated && (
                    <motion.div 
                      ref={evaluationRef}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`p-10 rounded-[32px] mb-10 shadow-sm ${
                        quiz.evaluationResult.startsWith("Chính xác") ? 'bg-green-50 text-green-900 border border-green-200' : 'bg-red-50 text-red-900 border border-red-200'
                      }`}
                    >
                      <h4 className="text-lg font-bold mb-6 flex items-center gap-3">
                        {quiz.evaluationResult.startsWith("Chính xác") ? <CheckCircle2 className="w-8 h-8 text-green-600" /> : <AlertCircle className="w-8 h-8 text-red-600" />}
                        Kết quả đánh giá
                      </h4>
                      <div className="prose prose-lg max-w-none mb-8 text-current">
                        <ReactMarkdown>{quiz.evaluationResult}</ReactMarkdown>
                      </div>
                      <div className="pt-8 border-t border-current/10">
                        <p className="text-[11px] font-bold mb-4 uppercase tracking-[0.2em] opacity-60">Giải thích Thần học:</p>
                        <div className="prose prose-lg max-w-none italic text-current leading-relaxed">
                          <ReactMarkdown>{quiz.currentQuestion.explanation}</ReactMarkdown>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  <div className="flex flex-col gap-5">
                    <div className="flex flex-col sm:flex-row gap-5">
                      {!quiz.isEvaluated ? (
                        <button
                          ref={submitBtnRef}
                          onClick={handleAnswerSubmit}
                          disabled={!quiz.userAnswer || quiz.loading}
                          className="flex-1 bg-primary text-on-primary shadow-lg py-4 md:py-6 rounded-2xl font-bold hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:hover:scale-100 disabled:neon-glow-none text-sm md:text-base relative overflow-hidden"
                        >
                          <div className="relative flex items-center justify-center gap-3 w-full">
                            {quiz.loading ? <RefreshCw className="w-7 h-7 animate-spin" /> : <CheckCircle2 className="w-7 h-7" />}
                            Kiểm tra đáp án
                          </div>
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => getNextQuestion()}
                            disabled={quiz.currentIndex + 1 >= quiz.sessionQuestions.length && quiz.sessionQuestions.length < quiz.targetQuestionCount}
                            className="flex-1 bg-primary text-on-primary shadow-lg py-4 md:py-6 rounded-2xl font-bold hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 text-sm md:text-base disabled:opacity-50 disabled:hover:scale-100 relative overflow-hidden"
                          >
                            <div className="relative flex items-center justify-center gap-3 w-full">
                              {quiz.currentIndex + 1 >= quiz.sessionQuestions.length && quiz.sessionQuestions.length < quiz.targetQuestionCount ? (
                                <>
                                  <RefreshCw className="w-7 h-7 animate-spin" />
                                  Đang tạo câu tiếp theo...
                                </>
                              ) : quiz.currentIndex + 1 >= quiz.targetQuestionCount ? (
                                <>
                                  <CheckCircle2 className="w-7 h-7" />
                                  Hoàn thành
                                </>
                              ) : (
                                <>
                                  <ChevronRight className="w-7 h-7" />
                                  Câu hỏi tiếp theo
                                </>
                              )}
                            </div>
                          </button>
                          
                          {!isCurrentQuestionKnown && (
                            <button
                              onClick={saveQuestion}
                              className={`flex-1 py-4 md:py-6 rounded-2xl border-2 font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-3 text-sm md:text-base ${
                                isCurrentQuestionSaved 
                                  ? "bg-orange-100 border-orange-200 text-orange-900 shadow-inner" 
                                  : "border-orange-500/30 text-orange-600 hover:bg-orange-50 hover:text-orange-700 hover:border-orange-500/50 active:bg-orange-100"
                              }`}
                            >
                              <Save className="w-6 h-6" />
                              {isCurrentQuestionSaved ? "Chưa biết ✓" : "Lưu vào Chưa biết"}
                            </button>
                          )}

                          {!isCurrentQuestionSaved && (
                            <button
                              onClick={saveToKnown}
                              className={`flex-1 py-4 md:py-6 rounded-2xl border-2 font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-3 text-sm md:text-base ${
                                isCurrentQuestionKnown 
                                  ? "bg-green-100 border-green-200 text-green-900 shadow-inner" 
                                  : "border-green-500/30 text-green-600 hover:bg-green-50 hover:text-green-700 hover:border-green-500/50 active:bg-green-100"
                              }`}
                            >
                              <CheckCircle2 className="w-6 h-6" />
                              {isCurrentQuestionKnown ? "Đã biết ✓" : "Lưu vào Đã biết"}
                            </button>
                          )}
                        </>
                      )}
                    </div>

                    {/* Navigation Buttons */}
                    {!quiz.isEvaluated && (
                      <div className="flex justify-between items-center pt-4 border-t border-outline-variant/10">
                        <button
                          onClick={getPreviousQuestion}
                          disabled={quiz.currentIndex === 0 || quiz.loading}
                          className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-primary hover:bg-primary/5 active:scale-95 active:bg-primary/10 transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:active:scale-100 disabled:active:bg-transparent"
                        >
                          <ChevronRight className="w-5 h-5 rotate-180" />
                          Câu trước
                        </button>
                        <div className="text-sm font-bold text-outline">
                          {quiz.currentIndex + 1} / {quiz.targetQuestionCount || quiz.sessionQuestions.length}
                        </div>
                        <button
                          onClick={getNextQuestion}
                          disabled={quiz.currentIndex === (quiz.targetQuestionCount || quiz.sessionQuestions.length) - 1 || (quiz.currentIndex + 1 >= quiz.sessionQuestions.length && quiz.sessionQuestions.length < quiz.targetQuestionCount)}
                          className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-primary hover:bg-primary/5 active:scale-95 active:bg-primary/10 transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:active:scale-100 disabled:active:bg-transparent"
                        >
                          {quiz.currentIndex + 1 >= quiz.sessionQuestions.length && quiz.sessionQuestions.length < quiz.targetQuestionCount ? "Đang tạo..." : "Câu sau"}
                          <ChevronRight className="w-5 h-5" />
                        </button>
                      </div>
                    )}
                  </div>
                  
                  {quiz.error && (
                    <p className="mt-6 text-error font-bold text-sm flex items-center gap-2 bg-error-container text-on-error-container p-4 rounded-xl">
                      <AlertCircle className="w-5 h-5" /> {quiz.error}
                    </p>
                  )}
                </motion.div>
              ) : (
                <motion.div 
                  key="essay-batch"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="glass-panel p-8 md:p-12 rounded-[40px] shadow-[0_8px_32px_rgba(0,0,0,0.03)] border border-outline-variant/10 flex flex-col h-full"
                >
                  <div className="flex justify-between items-start mb-10">
                    <div className="flex flex-col gap-2 w-full">
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] font-bold text-outline uppercase tracking-widest">
                          Bài tập tự luận ({questionType === 'short-essay' ? 'Ngắn' : 'Dài'})
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-12">
                    {quiz.sessionQuestions.map((q, idx) => (
                      <div key={idx} id={`essay-question-${idx}`} className="space-y-6 scroll-mt-32">
                        <div className="flex items-start gap-4">
                          <span className="flex-shrink-0 w-10 h-10 bg-primary text-on-primary rounded-full flex items-center justify-center font-bold text-lg">
                            {idx + 1}
                          </span>
                          <div className="text-xl font-bold leading-relaxed text-on-surface mt-1">
                            <ReactMarkdown>{q.question}</ReactMarkdown>
                          </div>
                        </div>
                        
                        <textarea
                          disabled={quiz.isEvaluated}
                          value={quiz.userAnswers[idx] || ''}
                          onFocus={(e) => {
                            e.target.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            setFocusedEssayIndex(idx);
                            playText(getQuestionTextToRead(q, questionType), idx);
                          }}
                          onBlur={() => setFocusedEssayIndex(null)}
                          onChange={(e) => {
                            const newAnswers = [...quiz.userAnswers];
                            newAnswers[idx] = e.target.value;
                            setQuiz(prev => ({ ...prev, userAnswers: newAnswers }));
                          }}
                          placeholder="Nhập câu trả lời của bạn tại đây..."
                          className="w-full h-40 bg-surface-container-low/50 backdrop-blur-md border-2 border-transparent focus:border-primary/20 rounded-2xl p-6 text-base focus:ring-4 focus:ring-primary/5 outline-none resize-none shadow-inner text-on-surface"
                        />

                        {quiz.isEvaluated && quiz.essayEvaluations[idx] && (
                          <motion.div 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="p-8 rounded-[32px] bg-secondary/10 text-on-surface border border-secondary/20"
                          >
                            <div className="flex justify-between items-center mb-4">
                              <div className="flex items-center gap-4">
                                <h4 className="text-lg font-bold flex items-center gap-3">
                                  <Award className="w-6 h-6" />
                                  Điểm: {quiz.essayEvaluations[idx].score}/10
                                </h4>
                                <button
                                  onClick={() => saveEssayQuestion(idx)}
                                  className={`p-2 rounded-lg transition-all active:scale-95 ${
                                    savedQuestions.some(sq => sq.question === q.question && sq.topic === q.topic)
                                      ? "bg-orange-100 text-orange-600"
                                      : "bg-surface-container-low/50 backdrop-blur-md text-outline hover:text-orange-500 hover:bg-orange-50"
                                  }`}
                                  title="Lưu vào Chưa biết"
                                >
                                  <Save className="w-5 h-5" />
                                </button>
                                <button
                                  onClick={() => saveEssayToKnown(idx)}
                                  className={`p-2 rounded-lg transition-all active:scale-95 ${
                                    knownQuestions.some(kq => kq.question === q.question && kq.topic === q.topic)
                                      ? "bg-green-100 text-green-600"
                                      : "bg-surface-container-low/50 backdrop-blur-md text-outline hover:text-green-500 hover:bg-green-50"
                                  }`}
                                  title="Lưu vào Đã biết"
                                >
                                  <CheckCircle2 className="w-5 h-5" />
                                </button>
                              </div>
                              <button
                                onClick={() => setExpandedExplanations(prev => ({ ...prev, [idx]: !prev[idx] }))}
                                className="text-sm font-bold text-secondary hover:underline flex items-center gap-2 active:scale-95 transition-transform"
                              >
                                {expandedExplanations[idx] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                Giải thích thêm
                              </button>
                            </div>
                            
                            {expandedExplanations[idx] && (
                              <div className="pt-6 border-t border-secondary/20 mt-4">
                                <div className="prose prose-lg max-w-none text-current">
                                  <ReactMarkdown>{quiz.essayEvaluations[idx].feedback}</ReactMarkdown>
                                </div>
                                <div className="mt-6 pt-6 border-t border-secondary/20">
                                  <p className="text-[11px] font-bold mb-4 uppercase tracking-[0.2em] opacity-60">Đáp án gợi ý:</p>
                                  <div className="prose prose-lg max-w-none italic text-current leading-relaxed">
                                    <ReactMarkdown>{q.explanation}</ReactMarkdown>
                                  </div>
                                </div>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-12 flex flex-col sm:flex-row gap-5">
                    {!quiz.isEvaluated ? (
                      <button
                        ref={submitBtnRef}
                        onClick={handleAnswerSubmit}
                        disabled={quiz.loading}
                        className="flex-1 bg-primary text-on-primary py-6 rounded-2xl font-bold hover:opacity-90 active:scale-[0.98] active:bg-primary/90 transition-all shadow-xl flex items-center justify-center gap-3 disabled:opacity-50 disabled:active:scale-100 text-base"
                      >
                        {quiz.loading ? <RefreshCw className="w-7 h-7 animate-spin" /> : <CheckCircle2 className="w-7 h-7" />}
                        Kiểm tra đáp án
                      </button>
                    ) : (
                      <button
                        onClick={finishQuiz}
                        className="flex-1 bg-primary text-on-primary py-6 rounded-2xl font-bold hover:opacity-90 active:scale-[0.98] active:bg-primary/90 transition-all shadow-xl flex items-center justify-center gap-3 text-base"
                      >
                        <RefreshCw className="w-7 h-7" />
                        Hoàn thành & Quay lại
                      </button>
                    )}
                  </div>
                  
                  {quiz.error && (
                    <p className="mt-6 text-error font-bold text-sm flex items-center gap-2 bg-error-container text-on-error-container p-4 rounded-xl">
                      <AlertCircle className="w-5 h-5" /> {quiz.error}
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </main>
      )}

      <footer className="max-w-7xl mx-auto mt-24 text-center py-12 border-t border-outline-variant/20">
        <div className="flex justify-center gap-6 mb-4 opacity-40 text-primary">
          <BookOpen className="w-5 h-5" />
          <Award className="w-5 h-5" />
          <History className="w-5 h-5" />
        </div>
        <p className="text-sm font-bold text-primary opacity-60 tracking-widest uppercase">© 2026 Học viện Đức Tin — Giáo Phận Xuân Lộc</p>
        <p className="mt-2 text-xs text-secondary font-medium italic">Ứng dụng ôn tập Giáo Lý thông minh hỗ trợ bởi AI</p>
      </footer>
      <FirebaseTest />
      </div>
    </div>
  );
};

export default App;

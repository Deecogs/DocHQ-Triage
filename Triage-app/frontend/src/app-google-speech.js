import React, { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import './assets/styles/app.css';
import AiAvatar from './core/components/AiAvatar';
import AiDashboard from './core/components/AiDashboard';
import AiQus from './core/components/AiQus';
import AiRomMain from './core/components/AiRomMain';
import AiVideo from './core/components/AiVideo';
import ServiceChat from './core/services/serviceChat';
import ServiceGoogleSpeech from './core/services/serviceGoogleSpeech';

export default function App() {
    const [chatHistory, setChatHistory] = useState([]);
    const [QnAHistory, setQnAHistory] = useState([]);
    const [aiSpeaking, setAiSpeaking] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [nextQuestion, setNextQuestion] = useState(null);
    const [analyser, setAnalyser] = useState(null);
    const [status, setStatus] = useState("");
    const [currentDisplayText, setCurrentDisplayText] = useState("");
    const [stage, setStage] = useState("idle");
    const [isStart, setIsStart] = useState(false);
    const [isOpen, setIsOpen] = useState(true);
    const [assessmentId, setAssessmentId] = useState(null);
    const assessmentIdRef = useRef(null);
    const [step, setStep] = useState(0);
    const [speechAPIAvailable, setSpeechAPIAvailable] = useState(true);

    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const streamRef = useRef(null);
    const isMountedRef = useRef(true);
    const audioContextRef = useRef(null);

    const mainService = new ServiceChat();
    const googleSpeechService = new ServiceGoogleSpeech();
    
    const recognitionRef = useRef(null);
    const synthRef = useRef(window.speechSynthesis);

    // Define all functions first before using them

    // Stop listening
    const stopListening = useCallback(() => {
        if (recognitionRef.current) {
            try {
                recognitionRef.current.stop();
            } catch (e) {
                // Ignore errors when stopping
            }
        }
        
        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
        
        setIsListening(false);
    }, []);

    // Text to speech handler
    const speakText = useCallback(async (text, isAiSpeaking = false, listenNext = true, stepNumber = 0) => {
        try {
            stopListening(); // Stop any current listening before speaking
            setAiSpeaking(true);
            if (isAiSpeaking) {
                setStatus("AI is speaking...");
            }

            if (speechAPIAvailable) {
                try {
                    const audioBlob = await googleSpeechService.textToSpeech(text);
                    await googleSpeechService.playAudio(audioBlob);
                } catch (apiError) {
                    console.warn('Google TTS failed, using browser TTS');
                    setSpeechAPIAvailable(false);
                    throw apiError;
                }
            } else {
                throw new Error('Speech API not available');
            }

            setAiSpeaking(false);
            setStatus("");

            if (listenNext && isMountedRef.current && !isListening) {
                setTimeout(() => startListening(), 500);
            }

            if (stepNumber === 8) {
                console.log('Preparing for video capture step');
                setTimeout(() => {
                    setCurrentDisplayText("");
                    setStep(stepNumber);
                }, 5000);

                for (let i = 5; i > 0; i--) {
                    setTimeout(() => {
                        setCurrentDisplayText(`Please be ready in ${i} seconds`);
                    }, (5 - i) * 1000);
                }
                setTimeout(() => setCurrentDisplayText(""), 5000);
            }
        } catch (error) {
            console.error('TTS error, using browser fallback:', error.message);
            setAiSpeaking(true);
            
            return new Promise((resolve) => {
                if (synthRef.current) {
                    synthRef.current.cancel();
                    
                    const utterance = new SpeechSynthesisUtterance(text);
                    utterance.rate = 0.9;
                    utterance.pitch = 1.0;
                    
                    utterance.onend = () => {
                        setAiSpeaking(false);
                        setStatus("");
                        if (listenNext && isMountedRef.current && !isListening) {
                            setTimeout(() => startListening(), 500);
                        }
                        
                        if (stepNumber === 8) {
                            setTimeout(() => {
                                setCurrentDisplayText("");
                                setStep(stepNumber);
                            }, 5000);

                            for (let i = 5; i > 0; i--) {
                                setTimeout(() => {
                                    setCurrentDisplayText(`Please be ready in ${i} seconds`);
                                }, (5 - i) * 1000);
                            }
                            setTimeout(() => setCurrentDisplayText(""), 5000);
                        }
                        
                        resolve();
                    };
                    
                    utterance.onerror = () => {
                        setAiSpeaking(false);
                        setStatus("");
                        if (listenNext && isMountedRef.current && !isListening) {
                            setTimeout(() => startListening(), 500);
                        }
                        resolve();
                    };
                    
                    synthRef.current.speak(utterance);
                } else {
                    setAiSpeaking(false);
                    setStatus("");
                    if (listenNext && isMountedRef.current && !isListening) {
                        setTimeout(() => startListening(), 500);
                    }
                    resolve();
                }
            });
        }
    }, [googleSpeechService, speechAPIAvailable, stopListening, isListening]);

    // Send chat message
    const sendChat = useCallback(async (message, assID, isVideo = false) => {
        console.log("=== sendChat called ===");
        console.log("Message type:", isVideo ? "Video" : "Text");
        console.log("Assessment ID:", assID);
        
        if (!isVideo) {
            setCurrentDisplayText(message);
        }
        setStatus(isVideo ? "Processing video..." : "Talking to the AI...");
        setIsListening(false);
        stopListening();

        try {
            let bodyChat;
            
            if (!isVideo) {
                const newMessage = { user: message };
                const updatedChats = [...chatHistory, newMessage];
                
                bodyChat = {
                    chat_history: updatedChats
                };
                
                setChatHistory(updatedChats);
            } else {
                bodyChat = {
                    chat_history: chatHistory,
                    video: message
                };
                console.log("Sending video for body part identification");
                console.log("Video size:", message.length);
            }

            const response = await axios.post('http://localhost:8000/chat', bodyChat, {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });
            
            console.log("=== AI Response ===");
            console.log("Success:", response.status === 200);
            console.log("Response:", response.data);
            
            if (response.status === 200 && response.data) {
                if (!isStart) {
                    setStage("chat");
                }
                
                const chatRes = response.data.response;
                const next_action = response.data.action;
                
                console.log("AI says:", chatRes);
                console.log("Action:", next_action);
                
                if (!isVideo) {
                    setChatHistory(prevChats => {
                        const updated = [...prevChats];
                        if (updated.length > 0 && !updated[updated.length - 1].response) {
                            updated[updated.length - 1].response = chatRes;
                        }
                        return updated;
                    });
                } else {
                    setChatHistory(prevChats => {
                        return [...prevChats, {
                            user: "[Showed pain location]",
                            response: chatRes
                        }];
                    });
                }
                
                if (next_action === "camera_on") {
                    console.log("Activating camera for body part identification");
                    setCurrentDisplayText(chatRes);
                    await speakText(chatRes, true, false, 8);
                } else if (next_action === "next_api") {
                    console.log("Moving to QnA phase");
                    setCurrentDisplayText("");
                    await speakText(chatRes, true, false);
                    setTimeout(() => {
                        setStep(11);
                        setAnalyser(false);
                    }, 500);
                } else {
                    setCurrentDisplayText(chatRes);
                    await speakText(chatRes, true);
                }
            } else {
                console.error("API call failed:", response);
                setStatus("Error: Failed to get response");
            }
        } catch (error) {
            console.error('Chat API error:', error);
            setStatus("Error communicating with AI");
            setTimeout(() => {
                if (isMountedRef.current && !isListening && !aiSpeaking) {
                    startListening();
                }
            }, 2000);
        }
    }, [chatHistory, isStart, speakText, stopListening]);

    // Send answer to QnA API
    const sendAnswerToAPI = useCallback(async (answer, assID) => {
        console.log('=== sendAnswerToAPI called ===');
        console.log('Answer:', answer);
        console.log('Assessment ID:', assID);
        
        setStatus("Processing answer...");
        setIsListening(false);
        stopListening();

        const newMessage = { user: answer };
        
        setQnAHistory(prevHistory => {
            const updatedHistory = [...prevHistory, newMessage];
            console.log('Updated QnA history:', updatedHistory);
            
            const bodyChat = {
                chat_history: updatedHistory
            };

            mainService.chatWithQnAAI(bodyChat, '', assID)
                .then((res) => {
                    console.log('QnA API response:', res);
                    if (res?.success) {
                        if (isStart) {
                            setStage("QnA");
                        }
                        
                        const questionRes = res.data;
                        setNextQuestion(questionRes);
                        
                        setQnAHistory(prev => {
                            const updated = [...prev];
                            if (updated.length > 0) {
                                updated[updated.length - 1].assistant = questionRes.question;
                            }
                            return updated;
                        });
                        
                        if (questionRes.action === "rom_api") {
                            console.log('Moving to ROM phase');
                            setStep(20);
                        } else if (questionRes.action === "dashboard_api") {
                            console.log('Moving to Dashboard phase');
                            setStep(24);
                        } else {
                            speakText(questionRes.question, true, true);
                        }
                    } else {
                        console.error('QnA API returned unsuccessful response');
                        setStatus("Error: Invalid response from server");
                        setTimeout(() => startListening(), 2000);
                    }
                })
                .catch(error => {
                    console.error('QnA API error:', error);
                    setStatus("Error getting next question");
                    setTimeout(() => {
                        if (isMountedRef.current && !isListening && !aiSpeaking) {
                            startListening();
                        }
                    }, 2000);
                });
            
            return updatedHistory;
        });
    }, [isStart, mainService, speakText, stopListening]);

    // Handle speech to text
    const handleSpeechToText = useCallback(async (audioBlob) => {
        try {
            setStatus("Processing speech...");
            let transcript = null;
            
            if (speechAPIAvailable && audioBlob) {
                try {
                    transcript = await googleSpeechService.speechToText(audioBlob);
                } catch (apiError) {
                    console.warn('Google STT failed:', apiError);
                    setSpeechAPIAvailable(false);
                }
            }
            
            if (!transcript && recognitionRef.current && !audioBlob) {
                transcript = await new Promise((resolve) => {
                    recognitionRef.current.onresult = (event) => {
                        const result = event.results[0][0].transcript;
                        resolve(result);
                    };
                    
                    recognitionRef.current.onerror = () => {
                        resolve(null);
                    };
                    
                    recognitionRef.current.onend = () => {
                        if (!transcript) resolve(null);
                    };
                    
                    recognitionRef.current.start();
                    setStatus("Listening (browser mode)...");
                });
            }
            
            if (transcript) {
                console.log('Speech recognized:', transcript);
                if (step >= 11) {
                    await sendAnswerToAPI(transcript, assessmentIdRef.current);
                } else {
                    await sendChat(transcript, assessmentIdRef.current);
                }
            } else {
                console.warn('No transcript received, prompting retry');
                setStatus("Could not understand. Please try again.");
                setTimeout(() => {
                    if (isMountedRef.current && !isListening && !aiSpeaking) {
                        startListening();
                    }
                }, 1000);
            }
        } catch (error) {
            console.error('Speech-to-Text error:', error);
            setStatus("Error processing speech. Please try again.");
            setTimeout(() => {
                if (isMountedRef.current && !isListening && !aiSpeaking) {
                    startListening();
                }
            }, 2000);
        }
    }, [step, googleSpeechService, speechAPIAvailable, sendAnswerToAPI, sendChat, isListening, aiSpeaking]);

    // Initialize media recorder
    const initMediaRecorder = useCallback(async () => {
        try {
            console.log('Initializing media recorder...');
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 48000
                } 
            });
            
            streamRef.current = stream;
            
            const recorder = new MediaRecorder(stream, { 
                mimeType: 'audio/webm;codecs=opus',
                audioBitsPerSecond: 128000
            });

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            recorder.onstop = async () => {
                console.log('Recording stopped, processing audio...');
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                audioChunksRef.current = [];
                
                if (audioBlob.size > 0) {
                    await handleSpeechToText(audioBlob);
                } else {
                    console.warn('No audio data captured');
                    setStatus("No audio captured. Please try again.");
                    setTimeout(() => startListening(), 1000);
                }
            };

            mediaRecorderRef.current = recorder;
            
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            audioContextRef.current = audioContext;
            const source = audioContext.createMediaStreamSource(stream);
            const analyserNode = audioContext.createAnalyser();
            analyserNode.fftSize = 256;
            source.connect(analyserNode);
            setAnalyser(analyserNode);
            
            console.log('Media recorder initialized successfully');
            setTimeout(() => startListening(), 100);
            
        } catch (error) {
            console.error('Error initializing media recorder:', error);
            setStatus("Microphone access denied. Please allow microphone access and refresh.");
        }
    }, [handleSpeechToText]);

    // Start listening
    const startListening = useCallback(() => {
        console.log('Starting listening, current step:', step);
        console.log('Speech API available:', speechAPIAvailable);
        console.log('Current isListening state:', isListening);
        console.log('AI speaking:', aiSpeaking);
        
        // Prevent starting if already listening or AI is speaking
        if (isListening || aiSpeaking) {
            console.log('Already listening or AI speaking, skipping');
            return;
        }
        
        if (!speechAPIAvailable && recognitionRef.current) {
            console.log('Using browser speech recognition');
            setIsListening(true);
            setStatus("Listening (browser)...");
            
            recognitionRef.current.onresult = async (event) => {
                const transcript = event.results[0][0].transcript;
                console.log('Browser recognition result:', transcript);
                setIsListening(false);
                
                if (step >= 11) {
                    await sendAnswerToAPI(transcript, assessmentIdRef.current);
                } else {
                    await sendChat(transcript, assessmentIdRef.current);
                }
            };
            
            recognitionRef.current.onerror = (event) => {
                console.error('Browser recognition error:', event.error);
                setIsListening(false);
                setStatus("Error: Could not understand. Please try again.");
                setTimeout(() => {
                    if (isMountedRef.current && !isListening && !aiSpeaking) {
                        startListening();
                    }
                }, 2000);
            };
            
            recognitionRef.current.onend = () => {
                setIsListening(false);
            };
            
            try {
                recognitionRef.current.start();
            } catch (error) {
                console.error('Error starting browser recognition:', error);
                setStatus("Error: Could not start listening");
                setIsListening(false);
            }
            return;
        }
        
        if (!mediaRecorderRef.current) {
            console.log('Media recorder not initialized, initializing...');
            initMediaRecorder();
            return;
        }

        if (mediaRecorderRef.current.state === 'inactive' && !isListening) {
            setIsListening(true);
            setStatus("Listening...");
            audioChunksRef.current = [];
            
            try {
                mediaRecorderRef.current.start();
                console.log('Recording started');
                
                setTimeout(() => {
                    if (mediaRecorderRef.current?.state === 'recording') {
                        console.log('Auto-stopping recording after 5 seconds');
                        stopListening();
                    }
                }, 5000);
            } catch (error) {
                console.error('Error starting recording:', error);
                setStatus("Error: Could not start recording");
                setIsListening(false);
            }
        } else {
            console.log('Media recorder already in state:', mediaRecorderRef.current.state);
        }
    }, [initMediaRecorder, step, speechAPIAvailable, sendAnswerToAPI, sendChat, stopListening, isListening, aiSpeaking]);

    // Handle video from video capture
    const sendPainPointVideo = useCallback((base64Video) => {
        console.log("=== sendPainPointVideo called ===");
        console.log("Has video:", !!base64Video);
        console.log("Video size:", base64Video?.length || 0);
        console.log("Assessment ID:", assessmentId);
        console.log("Assessment ID Ref:", assessmentIdRef.current);
        
        const currentAssessmentId = assessmentIdRef.current || assessmentId;
        
        if (base64Video && currentAssessmentId) {
            console.log("Sending video to AI for body part identification");
            sendChat(base64Video, currentAssessmentId, true);
        } else {
            console.error("Missing video or assessment ID");
            setStatus("Error: Could not process video. Please try again.");
            setTimeout(() => {
                setStep(7);
                startListening();
            }, 2000);
        }
    }, [assessmentId, sendChat, startListening]);

    // Start assessment
    const startAssessment = useCallback(() => {
        const body = {
            userId: 1,
            anatomyId: 3,
            assessmentType: "PAIN",
        };
        
        mainService.createAssessment(body, '')
            .then(async (res) => {
                if (res?.success) {
                    const newAssessmentId = res.data.assessmentId;
                    setAssessmentId(newAssessmentId);
                    assessmentIdRef.current = newAssessmentId;
                    setIsStart(true);
                    await sendChat('Hello', newAssessmentId);
                }
            })
            .catch(error => {
                console.error('Error creating assessment:', error);
                setStatus("Error starting assessment");
            });
    }, [mainService, sendChat]);

    // Save ROM data
    const saveRomData = useCallback(async (romData) => {
        try {
            const res = await mainService.saveRomData(romData, '', assessmentId);
            console.log("ROM data saved:", res);
        } catch (error) {
            console.error('Error saving ROM data:', error);
            setStatus("Error saving ROM data");
        }
    }, [assessmentId, mainService]);

    // Reset assessment
    const reset = useCallback(() => {
        setStep(0);
        setIsStart(false);
        setIsOpen(true);
        setChatHistory([]);
        setQnAHistory([]);
        setAssessmentId(null);
        assessmentIdRef.current = null;
        setNextQuestion(null);
        setCurrentDisplayText("");
        setStatus("");
        setStage("idle");
    }, []);

    // Update ref when assessmentId changes
    useEffect(() => {
        assessmentIdRef.current = assessmentId;
    }, [assessmentId]);

    // Initialize on mount
    useEffect(() => {
        isMountedRef.current = true;
        
        googleSpeechService.checkHealth().then(isAvailable => {
            setSpeechAPIAvailable(isAvailable);
            console.log('Speech API available:', isAvailable);
        });
        
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = false;
            recognitionRef.current.interimResults = false;
            recognitionRef.current.lang = 'en-US';
        }
        
        initMediaRecorder();

        return () => {
            isMountedRef.current = false;
            
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close();
            }
            if (recognitionRef.current) {
                recognitionRef.current.abort();
            }
            window.speechSynthesis.cancel();
        };
    }, [initMediaRecorder, googleSpeechService]);

    return (
        <div className='bg-prime w-full h-screen overflow-hidden relative'>
            <div className='absolute top-0 left-0 w-full flex justify-center items-start z-50'>
                <div className='bg-white/90 px-4 py-2 rounded-md shadow-sm'>
                    {status}
                </div>
            </div>
            
            <AiVideo step={step} next={sendPainPointVideo} />
            
            <AiQus 
                step={step}
                send={sendAnswerToAPI}
                onComplete={() => setStep(prev => prev + 1)}
                nextQuestion={nextQuestion}
            />
            
            {step < 8 && (
                <AiAvatar 
                    text={currentDisplayText} 
                    isStart={isStart} 
                    onStart={startAssessment} 
                    isOpen={isOpen} 
                    analyser={analyser} 
                    step={step}
                    isListening={isListening}
                    isAiSpeaking={aiSpeaking}
                />
            )}
            
            <AiRomMain 
                step={step} 
                next={() => setStep(prev => prev + 1)} 
                saveRomData={saveRomData} 
            />
            
            <AiDashboard 
                step={step} 
                assessmentId={assessmentId} 
                reset={reset} 
            /> 
        </div>
    );
}
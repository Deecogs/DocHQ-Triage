import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, Mic } from 'lucide-react';
import { AnimatePresence, motion } from "motion/react";

export default function AiQus(props) {
    const localStreamRef = useRef();
    const [isLocalListening, setIsLocalListening] = useState(false);
    const recognition = useRef(null);
    const [currentAnswer, setCurrentAnswer] = useState("");
    const [currentQuestion, setCurrentQuestion] = useState(null);
    const [localHistory, setLocalHistory] = useState([]);
    const isProcessingAnswer = useRef(false);
    const lastQuestionId = useRef(null);
    
    const init = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            if (localStreamRef.current) {
                localStreamRef.current.srcObject = stream;
            }
        } catch (error) {
            console.error('Error accessing camera/microphone:', error);
        }
    };

    // Initialize camera when step becomes 11
    useEffect(() => {
        if (parseInt(props.step) === 11) {
            console.log('AiQus: Initializing camera for step 11');
            init();
        }
        
        // Cleanup when leaving QnA steps
        return () => {
            if (parseInt(props.step) < 11 || parseInt(props.step) > 19) {
                if (localStreamRef.current && localStreamRef.current.srcObject) {
                    localStreamRef.current.srcObject.getTracks().forEach(track => track.stop());
                }
                if (recognition.current) {
                    recognition.current.abort();
                }
                setIsLocalListening(false);
                isProcessingAnswer.current = false;
            }
        };
    }, [props.step]);

    // Speech recognition is handled by main app, no need for separate recognition
    useEffect(() => {
        if (parseInt(props.step) >= 11 && parseInt(props.step) <= 19) {
            console.log('AiQus: QnA mode active - relying on main app for speech recognition');
        }
        
        return () => {
            // Cleanup any local recognition if it exists
            if (recognition.current) {
                recognition.current.abort();
                recognition.current = null;
            }
        };
    }, [props.step]);

    // Handle new questions
    const handleNewQuestion = useCallback(() => {
        if (props.nextQuestion && 
            props.nextQuestion.question &&
            props.nextQuestion.question !== lastQuestionId.current && 
            !isProcessingAnswer.current) {
            
            console.log('AiQus: New question received:', props.nextQuestion.question);
            setCurrentQuestion(props.nextQuestion);
            setCurrentAnswer('');
            lastQuestionId.current = props.nextQuestion.question;
            
            // Don't auto-start listening in QnA mode - let main app handle it
            // The main app will handle the listening after AI speaks the question
        }
    }, [props.nextQuestion]);

    useEffect(() => {
        handleNewQuestion();
    }, [handleNewQuestion]);

    // Manual listening for QnA (disabled - main app handles this)
    const startQnAListening = useCallback(() => {
        console.log('AiQus: Local listening disabled - main app handles speech recognition');
        // This is now disabled as main app handles all speech recognition
        return;
    }, []);

    const stopQnAListening = useCallback(() => {
        if (recognition.current && isLocalListening) {
            recognition.current.stop();
            setIsLocalListening(false);
        }
    }, [isLocalListening]);

    const handleAnswer = useCallback(async (answer) => {
        if (isProcessingAnswer.current || !answer || !answer.trim()) {
            console.log('AiQus: Skipping answer processing - already processing or empty answer');
            return;
        }

        isProcessingAnswer.current = true;
        setCurrentAnswer(answer);
        stopQnAListening();
        
        console.log('AiQus: Processing answer:', answer);
        
        // Update local history for display
        const updatedHistory = [...localHistory];
        if (currentQuestion && !updatedHistory.find(h => h.response === currentQuestion.question)) {
            updatedHistory.push({ 
                response: currentQuestion.question,
                user: answer 
            });
        } else {
            updatedHistory.push({ user: answer });
        }
        setLocalHistory(updatedHistory);
        
        try {
            // Send answer to parent component (main app)
            await props.send(answer);
        } catch (error) {
            console.error('AiQus: Error sending answer:', error);
        } finally {
            // Reset processing flag after a delay
            setTimeout(() => {
                isProcessingAnswer.current = false;
            }, 2000);
        }
    }, [currentQuestion, localHistory, props.send, stopQnAListening]);

    const handleOptionClick = useCallback((option) => {
        if (!isProcessingAnswer.current) {
            handleAnswer(option);
        }
    }, [handleAnswer]);

    // Don't render if not in QnA steps
    if (parseInt(props.step) < 11 || parseInt(props.step) > 19) {
        return null;
    }

    return (
        <AnimatePresence initial={false}>
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className='w-[80%] h-[60vh] absolute left-[10%] mt-[10%]'
            >
                <div className='flex items-center justify-between'>
                    <div className='w-[40%]'>
                        <div className='w-full pt-[80%] relative border-[6px] border-primeLight rounded-tl-[60px] rounded-tr-[2px] rounded-br-[60px] rounded-bl-[2px] overflow-hidden shadow-2xl'>
                            <video ref={localStreamRef} autoPlay playsInline muted className='absolute object-cover inset-0 w-full h-full' />
                            
                            {/* Manual mic button for QnA (disabled - main app handles speech) */}
                            <div 
                                className="bg-gray-300 w-[40px] h-[40px] absolute rounded-full bottom-[10px] left-[12px] flex items-center justify-center cursor-not-allowed opacity-50"
                                title="Speech recognition handled by main app"
                            >
                                <Mic size={22} color="gray" />
                            </div>
                            
                            <div className='bg-white w-[40px] h-[40px] absolute rounded-full bottom-[10px] left-[68px] flex items-center justify-center cursor-pointer hover:bg-gray-100'>
                                <Camera size={22} />
                            </div>
                            
                            {/* Status indicator */}
                            <div className='absolute top-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs'>
                                QnA Mode - {isProcessingAnswer.current ? 'Processing...' : 'Main app handles speech'}
                            </div>
                        </div>
                    </div>
                    
                    <div className='w-[50%] h-[70vh] space-y-6 relative overflow-y-auto'>
                        <div className='space-y-3 flex flex-col items-end'>
                            {localHistory.map((item, index) => (
                                <div key={index} className="question-container w-full">
                                    {item.response && (
                                        <div className="w-full flex justify-start mb-2">
                                            <p className='bg-chSend px-4 py-2 inline-block shadow-md rounded-t-[14px] rounded-br-[1px] rounded-bl-[14px] text-base max-w-[80%]'>
                                                {item.response}
                                            </p>
                                        </div>
                                    )}
                                    {item.user && item.user !== "hi" && (
                                        <div className="w-full flex justify-end">
                                            <p className='bg-primeDark px-4 py-2 inline-block shadow-md rounded-t-[14px] rounded-bl-[1px] rounded-br-[14px] text-base max-w-[80%]'>
                                                {item.user}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ))}
                            
                            {/* Current question */}
                            {currentQuestion && !localHistory.find(h => h.response === currentQuestion.question) && (
                                <div className="question-container w-full">
                                    <div className="w-full flex justify-start mb-2">
                                        <p className='bg-chSend px-4 py-2 inline-block shadow-md rounded-t-[14px] rounded-br-[1px] rounded-bl-[14px] text-base max-w-[80%]'>
                                            {currentQuestion.question}
                                        </p>
                                    </div>
                                    
                                    {/* Show options if available and no answer yet */}
                                    {!currentAnswer && currentQuestion.options && Array.isArray(currentQuestion.options) && (
                                        <div className="question-option-container w-full flex flex-col items-end space-y-2 mt-2">
                                            {currentQuestion.options.map((option, index) => (
                                                <div 
                                                    key={index}
                                                    className={`cursor-pointer question-option ${
                                                        isProcessingAnswer.current ? 'pointer-events-none opacity-50' : ''
                                                    }`} 
                                                    onClick={() => handleOptionClick(option)}
                                                >
                                                    <p className='bg-chSend hover:bg-primeDark inline-block px-4 py-1 shadow-md rounded-t-[14px] rounded-br-[1px] rounded-bl-[14px] text-xs transition-colors'>
                                                        {option}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    
                                    {/* Show current answer if exists */}
                                    {currentAnswer && (
                                        <div className="w-full flex justify-end mt-2">
                                            <p className='bg-primeDark px-4 py-2 inline-block shadow-md rounded-t-[14px] rounded-bl-[1px] rounded-br-[14px] text-base max-w-[80%]'>
                                                {currentAnswer}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
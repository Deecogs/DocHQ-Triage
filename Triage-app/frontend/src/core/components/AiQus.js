import "@tensorflow/tfjs";
import * as tf from "@tensorflow/tfjs";
import { Camera, Mic } from 'lucide-react';
import { AnimatePresence, motion } from "motion/react";
import React, { useEffect, useRef, useState } from 'react';
export default function AiQus(props) {
    const localStreamRef = useRef();
    const QnAHistoryRef = useRef([]);
    const [isListening, setIsListening] = useState(false);
    const recognition = useRef(null);
    const [currentAnswer, setCurrentAnswer] = useState("");
    const [currentQuestion, setCurrentQuestion] = useState(props.nextQuestion);
    const [audioContext, setAudioContext] = useState(null);
    const [analyser, setAnalyser] = useState(null);

    const init = async () => {
        await tf.ready();
        await tf.setBackend("webgl");
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStreamRef.current.srcObject = stream;
        await props.send("hi");
    }

    useEffect(() => {
        if (parseInt(props.step) === 11) {
            init();
        }
    }, [props.step]);

    useEffect(() => {
        // Initialize speech recognition
        if ('webkitSpeechRecognition' in window) {
            recognition.current = new window.webkitSpeechRecognition();
            recognition.current.continuous = false;
            recognition.current.interimResults = false;
        }
        const context = new (window.AudioContext || window.webkitAudioContext)();
        const analyserNode = context.createAnalyser();
        analyserNode.fftSize = 256;
        setAudioContext(context);
        setAnalyser(analyserNode);
        
        return () => {
            if (context.state !== 'closed') {
                context.close();
            }
        };
    }, []);


    useEffect(() => {
        if (props.nextQuestion) {
            // Update current question for display
            setCurrentQuestion(props.nextQuestion);
            setCurrentAnswer('');

            // Update QnAHistoryRef with the assistant's response
            if (QnAHistoryRef.current.length > 0) {
                // const currentQnA = [...QnAHistoryRef.current];
                // const lastEntry = currentQnA[currentQnA.length - 1];
                
                // Add assistant's response to the last entry
                // lastEntry.assistant = props.nextQuestion.question;
                QnAHistoryRef.current.push({
                    assistant: props.nextQuestion.question,
                });
                console.log("QnAHistoryRef.current =>",QnAHistoryRef.current);
                
            }else{
                QnAHistoryRef.current = [{ assistant: props.nextQuestion.question }];
            }
            startListening();
        }
    }, [props.nextQuestion]);

    const startListening = () => {
        if (recognition.current) {
            recognition.current.onstart = () => {
                setIsListening(true);
                // Connect microphone to analyzer when starting to listen
                navigator.mediaDevices.getUserMedia({ audio: true })
                    .then(stream => {
                        const source = audioContext.createMediaStreamSource(stream);
                        source.connect(analyser);
                    })
                    .catch(err => console.error("Error accessing microphone:", err));
            };
            
            recognition.current.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                handleAnswer(transcript);
            };

            recognition.current.onend = () => {
                setIsListening(false);
                // Disconnect when done
                if (analyser) {
                    analyser.disconnect();
                }
            };

            recognition.current.start();
        }
    };

    const stopListening = () => {
        if (recognition.current) {
            recognition.current.stop();
            setIsListening(false);
        }
    };

    const handleAnswer = async (answer) => {
        console.log("handleAnswer =>",answer);
        setCurrentAnswer(answer);
        stopListening();
        try {
            if(QnAHistoryRef.current.length > 0){
                QnAHistoryRef.current[QnAHistoryRef.current.length - 1].answer = answer;
            }
            // console.log("QnAHistoryRef.handleAnswer =>",QnAHistoryRef.current);
            // const currentQnA = [...QnAHistoryRef.current, { user: answer }];
            // QnAHistoryRef.current = currentQnA;

            const response = await props.send(answer, true);
            
            console.log("response =>",response);
            // if (response.success) {
            //     if (response.data.action === "next_api") {
            //         // Move to next component/step
            //         props.onComplete && props.onComplete();
            //     } else {
            //         // Update current question with new one
            //         setCurrentQuestion({
            //             text: response.data.question,
            //             options: response.data.options || []
            //         });
            //     }
            // }
        } catch (error) {
            console.error("Error handling answer:", error);
        }
    };

    return (
        <AnimatePresence initial={false}>
            {(parseInt(props.step) >= 11 && parseInt(props.step) <= 15) && (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className='w-[80%] h-[60vh] absolute left-[10%] mt-[10%]'
                >
                    {/* <AiOrb analyser={analyser} /> */}
                    <div className='flex items-center justify-between'>
                        <div className='w-[40%]'>
                            <div className='w-full pt-[80%] relative border-[6px] border-primeLight rounded-tl-[60px] rounded-tr-[2px] rounded-br-[60px] rounded-bl-[2px] overflow-hidden shadow-2xl'>
                                <video ref={localStreamRef} autoPlay playsInline muted className='absolute object-cover inset-0 w-full h-full' />
                                <div 
                                    className={`bg-white w-[40px] h-[40px] absolute rounded-full bottom-[10px] left-[12px] flex items-center justify-center cursor-pointer ${isListening ? 'bg-red-500' : ''}`} 
                                    onClick={() => isListening ? stopListening() : startListening()}
                                >
                                    <Mic size={22} color={isListening ? 'white' : 'black'} />
                                </div>
                                <div className='bg-white w-[40px] h-[40px] absolute rounded-full bottom-[10px] left-[68px] flex items-center justify-center cursor-pointer'>
                                    <Camera size={22} />
                                </div>
                            </div>
                        </div>
                        
                        <div className='w-[50%] h-[70vh] space-y-6 relative overflow-y-auto'>
                                <div className='space-y-3 flex flex-col items-end'>
                                {QnAHistoryRef.current.slice(0, -1).map((item,index)=>(
                                    <div key={index} className="question-container">
                                        <p className='bg-chSend px-4 py-2 inline-block shadow-md rounded-t-[14px] rounded-br-[1px] rounded-bl-[14px] text-base'>
                                            {item.assistant}
                                        </p>
                                        
                                        <p className='bg-chSend px-4 py-2 inline-block shadow-md rounded-t-[14px] rounded-bl-[1px] rounded-br-[14px] text-base answer-text bg-primeDark'>
                                            {item.answer}
                                        </p>
                                    </div>
                                    ))}
                                {currentQuestion && (
                                            <div className="question-container">
                                                <p className='bg-chSend px-4 py-2 inline-block shadow-md rounded-t-[14px] rounded-br-[1px] rounded-bl-[14px] text-base'>
                                                    {currentQuestion.question}
                                                </p>
                                                <br />

                                                {!currentAnswer &&<div className="question-option-container">
                                                    {currentQuestion.options.map((option, index) => (
                                                        <div 
                                                            key={index}
                                                            className='cursor-pointer question-option' 
                                                            onClick={() => handleAnswer(option)}
                                                        >
                                                            <p className='bg-chSend hover:bg-primeDark inline-block px-4 py-1 shadow-md rounded-t-[14px] rounded-br-[1px] rounded-bl-[14px] text-xs'>
                                                                {option}
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>}
                                                {currentAnswer && (
                                                    <p className='bg-chSend px-4 py-2 inline-block shadow-md rounded-t-[14px] rounded-bl-[1px] rounded-br-[14px] text-base answer-text bg-primeDark'>
                                                        {currentAnswer}
                                                    </p>
                                                )}
                                            </div>
                                    )}
                                </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

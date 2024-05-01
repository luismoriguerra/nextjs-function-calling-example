import { OpenAI } from "openai";
import { createAI, getMutableAIState, render } from "ai/rsc";
import { z } from "zod";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Define the initial state of the AI. It can be any JSON object.
const initialAIState: {
    role: 'user' | 'assistant' | 'system' | 'function';
    content: string;
    id?: string;
    name?: string;
}[] = [];

// The initial UI state that the client will keep track of, which contains the message IDs and their UI nodes.
const initialUIState: {
    id: number;
    display: React.ReactNode;
}[] = [];

// AI is a provider you wrap your application with so you can access AI and UI state in your components.
export const AIProvider = createAI({
    actions: {
        submitUserMessage
    },
    // Each state can be any shape of object, but for chat applications
    // it makes sense to have an array of messages. Or you may prefer something like { id: number, messages: Message[] }
    initialUIState,
    initialAIState
});

// An example of a spinner component. You can also import your own components,
// or 3rd party component libraries.
function Spinner() {
    return <div>Loading...</div>;
}

// An example of a flight card component.
function FlightCard({ flightInfo }) {
    return (
        <div>
            <h2>Flight Information</h2>
            <p>Flight Number: {flightInfo.flightNumber}</p>
            <p>Departure: {flightInfo.departure}</p>
            <p>Arrival: {flightInfo.arrival}</p>
        </div>
    );
}

// An example of a function that fetches flight information from an external API.
async function getFlightInfo(flightNumber: string) {
    return {
        flightNumber,
        departure: 'New York',
        arrival: 'San Francisco',
    };
}

async function submitUserMessage(userInput: string) {
    'use server';

    const aiConversationState = getMutableAIState<typeof AIProvider>();

    // Update the AI state with the new user message.
    aiConversationState.update([
        ...aiConversationState.get(),
        {
            role: 'user',
            content: userInput,
        },
    ]);

    // The `render()` creates a generated, streamable UI.
    const streamableChatUI = render({
        model: 'gpt-4-0125-preview',
        provider: openai,
        messages: [
            { role: 'system', content: 'You are a flight assistant' },
            ...aiConversationState.get()
        ],
        tools: {
            get_flight_info: {
                description: 'Get the information for a flight',
                parameters: z.object({
                    flightNumber: z.string().describe('the number of the flight')
                }).required(),
                render: async function* ({ flightNumber }) {
                    // Show a spinner on the client while we wait for the response.
                    yield <Spinner />

                    // Fetch the flight information from an external API.
                    const flightInfo = await getFlightInfo(flightNumber)

                    // Update the final AI state.
                    aiConversationState.done([
                        ...aiConversationState.get(),
                        {
                            role: "function",
                            name: "get_flight_info",
                            // Content can be any string to provide context to the LLM in the rest of the conversation.
                            content: JSON.stringify(flightInfo),
                        }
                    ]);

                    // Return the flight card to the client.
                    return <FlightCard flightInfo={flightInfo} />
                }
            }
        },
        // `text` is called when an AI returns a text response (as opposed to a tool call).
        // Its content is streamed from the LLM, so this function will be called
        // multiple times with `content` being incremental.
        text: ({ content, done }) => {
            // When it's the final content, mark the state as done and ready for the client to access.
            if (done) {
                aiConversationState.done([
                    ...aiConversationState.get(),
                    {
                        role: "assistant",
                        content
                    }
                ]);
            }

            return <p>{content}</p>
        }
    })

    return {
        id: Date.now(),
        display: streamableChatUI
    };
}

import { MessageSquare } from "lucide-react";

const FloatingChatButton = () => {
  return (
    <button className="fixed bottom-8 right-8 bg-foreground text-background p-4 rounded-full shadow-2xl hover:bg-cobalt transition-all duration-300 z-40 group flex items-center gap-0 hover:gap-3 overflow-hidden">
      <MessageSquare className="w-5 h-5" />
      <span className="max-w-0 group-hover:max-w-xs transition-all duration-500 ease-in-out whitespace-nowrap text-sm font-medium opacity-0 group-hover:opacity-100">
        Chat with Expert
      </span>
    </button>
  );
};

export default FloatingChatButton;

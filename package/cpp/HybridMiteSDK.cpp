#include "HybridMiteSDK.hpp"
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <unistd.h>
#include <execinfo.h>

namespace margelo::nitro::mite {
    const std::string HybridMiteSDK::hello = "Hello World!";
    std::vector<int> HybridMiteSDK::registeredSignals;
    std::vector<struct sigaction> HybridMiteSDK::oldHandlers;
    bool HybridMiteSDK::handlersInstalled = false;
    
    void HybridMiteSDK::installCrashHandlers() {
        if (handlersInstalled) {
            return;
        }
        
        struct sigaction action;
        memset(&action, 0, sizeof(action));
        action.sa_handler = handleSignal;
        sigemptyset(&action.sa_mask);
        
        // Install handlers for each signal
        for (size_t i = 0; i < registeredSignals.size(); i++) {
            int signal = registeredSignals[i];
            sigaction(signal, &action, &oldHandlers[i]);
        }
        
        handlersInstalled = true;
    }
    
    void HybridMiteSDK::removeCrashHandlers() {
        if (!handlersInstalled) {
            return;
        }
        
        // Restore previous handlers
        for (size_t i = 0; i < registeredSignals.size(); i++) {
            int signal = registeredSignals[i];
            sigaction(signal, &oldHandlers[i], nullptr);
        }
        
        handlersInstalled = false;
    }
    
    void HybridMiteSDK::handleSignal(int signal) {
        // Log the crash
        logCrashReport(signal);
        
        // Restore default handler and re-raise signal
        struct sigaction action;
        memset(&action, 0, sizeof(action));
        action.sa_handler = SIG_DFL;
        sigemptyset(&action.sa_mask);
        sigaction(signal, &action, nullptr);
        
        // Re-raise signal
        kill(getpid(), signal);
    }
    
    void HybridMiteSDK::logCrashReport(int signal) {
        const char* signalName = "";
        switch (signal) {
            case SIGABRT: signalName = "SIGABRT"; break;
            case SIGBUS: signalName = "SIGBUS"; break;
            case SIGFPE: signalName = "SIGFPE"; break;
            case SIGILL: signalName = "SIGILL"; break;
            case SIGSEGV: signalName = "SIGSEGV"; break;
            case SIGSYS: signalName = "SIGSYS"; break;
            case SIGTRAP: signalName = "SIGTRAP"; break;
            default: signalName = "UNKNOWN"; break;
        }
        
        // Print crash information
        fprintf(stderr, "[Mite] App crashed with signal %d (%s)\n", signal, signalName);
        
        // Get backtrace
        void* callstack[128];
        int frames = backtrace(callstack, 128);
        char** symbols = backtrace_symbols(callstack, frames);
        
        if (symbols != nullptr) {
            fprintf(stderr, "[Mite] Stack trace:\n");
            for (int i = 0; i < frames; i++) {
                fprintf(stderr, "[Mite] %s\n", symbols[i]);
            }
            free(symbols);
        }
        
        // Here you would save the crash report to disk or send it to a server
        // This code just logs to stderr for demonstration
    }
}

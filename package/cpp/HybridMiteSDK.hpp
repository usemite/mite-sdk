#pragma once

#include <string>
#include <csignal>
#include <vector>
#include "HybridMiteSDKSpec.hpp"

namespace margelo::nitro::mite {
    class HybridMiteSDK: public HybridMiteSDKSpec {
    public:
        HybridMiteSDK(): HybridObject(TAG) {
            // Initialize signals to track
            if (registeredSignals.empty()) {
                registeredSignals = {
                    SIGABRT,    // Abort signal
                    SIGBUS,     // Bus error
                    SIGFPE,     // Floating point exception
                    SIGILL,     // Illegal instruction
                    SIGSEGV,    // Segmentation fault
                    SIGSYS,     // Bad system call
                    SIGTRAP     // Trace trap
                };
                
                // Resize oldHandlers to match registeredSignals
                oldHandlers.resize(registeredSignals.size());
            }
        }
        
        ~HybridMiteSDK() {
            // Make sure handlers are removed
            removeCrashHandlers();
        }

        std::string getHello() override {
            return hello;
        }

        void installCrashHandlers() override;
        void removeCrashHandlers() override;

    private:
        static void handleSignal(int signal);
        static std::vector<int> registeredSignals;
        static std::vector<struct sigaction> oldHandlers;
        static bool handlersInstalled;
        static void logCrashReport(int signal);

    public:
        static const std::string hello;
    };
}

#pragma once

#include <string>
#include "HybridMiteSDKSpec.hpp"

namespace margelo::nitro::mite {
    class HybridMiteSDK: public HybridMiteSDKSpec {
    public:
        HybridMiteSDK(): HybridObject(TAG) {}

        std::string getHello() override {
            return hello;
        }
        static const std::string hello;
    };
}

// TODO: Export all HybridObjects here

import { NitroModules } from "react-native-nitro-modules";
export * from "./specs/Math.nitro";
import type { Math } from "./specs/Math.nitro";
import { BugzzApp } from "./BugzzApp";

// export const math = NitroModules.createHybridObject<Math>("Math")
// console.log('NITRO MODULE->', math.pi)

export { BugzzApp }

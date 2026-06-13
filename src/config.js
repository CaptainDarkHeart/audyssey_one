// ── Customization parameters ────────────────────────────────────────────────
// These are the settings intended for advanced users to edit in source.
// UI-toggled flags (forceSmall, etc.) live in state.js instead.
/////////////////////////// Customization parameters for enthusiasts //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
let endFrequency = 282;// End frequency for amplitude correction filters (max. 1000Hz)
const maxBoost = 0;// Maximum boost per filter (dB), note: maxBoost is mainly effective if overallMaxBoostdB is adjusted, introducing higher auto-leveling compensation
///////////////////////// For optimal sound quality, OCA recommends to maintain the default values above! ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
let forceSmall = false;// If 'true', front speakers will NOT be set to 'Large / Full range'
let forceWeak = false;// For systems with less powerful receivers and identical speakers, if 'true' all bed channels will be crossed over at 80Hz and all Atmos channels at 120Hz
let forceCentre = false;// If 'true', front speakers will be set to 'Large', 'Subwoofer Mode' will need to be set to 'LFE' in the AVR, subwoofer(s) will be time aligned to 'Centre' speaker'
let forceLarge = false;// If 'true', front speakers will NOT be set to 'Small'
let noInversion = false;// If true, avoids subwoofer polarity inversion. This may limit alignment options and could negatively impact sound quality
let limitLPF = null;// 'true' limits lpf evaluation frequencies for even number of sub(s), odd number of sub(s) are automatically limited when null to avoid bass localization in 'LFE + Main' mode
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////// Customize crossover frequency search ranges per speaker ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
const perSpeakerXOSearchRange = {           "BDL":  [],       //Left & Right pair
                                            "C":    [],       
                                            "CH":   [],
                                            "FDL":  [],       //Left & Right pair
                                            "FHL":  [],       //Left & Right pair
                                            "FL":   [],       //Left & Right pair
                                            "FWL":  [],       //Left & Right pair
                                            "RHL":  [],       //Left & Right pair
                                            "SB" :  [],
                                            "SBL":  [],       //Left & Right pair
                                            "SDL":  [],       //Left & Right pair
                                            "SLA":  [],       //Left & Right pair
                                            "SHL":  [],       //Left & Right pair
                                            "TFL":  [],       //Left & Right pair
                                            "TML":  [],       //Left & Right pair
                                            "TRL":  [],       //Left & Right pair
                                            "TS":   [],
/////////////////////////////////////////////////////////// Usage samples ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                            "XYL":  [40],        // will set crossover for speaker XYL & XYR at 40Hz,
                                            "XWL":  [40, 90],    // will set XO search range for speaker pair XWL & XWR from 40Hz to 90Hz. Best result among 40, 60, 80 and 90Hz will be selected,
                                            "XY":   [110, 110],  // will set crossover for speaker XY at 110Hz,
                                            "Q":    [120]        // will set speaker Q crossover frequency at 120Hz.  
                                                                                              };
///// The available frequencies are: 40 Hz, 60 Hz, 80 Hz, 90 Hz, 100 Hz, 110 Hz, 120 Hz, 150 Hz, 180 Hz, 200 Hz, and 250 Hz. Please note that 180 Hz is not available in all receiver models! /////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
let CenterSpeakerDistance = 0.00;// Enter the measured distance from your center speaker to the main listening position (MLP) here (in meters) if you wish to override Evo distance settings.
//Keep in mind that this adjustment does not impact the immersive time alignment of your speakers; it only serves to the eye and provides accurate distances in the AVR setup menu.
//Individual speaker distance values have no significance as long as the distance DIFFERENCES between speakers remain unchanged. FL will be assigned that distance in the absence of speaker C.
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export { endFrequency, maxBoost, perSpeakerXOSearchRange, CenterSpeakerDistance };

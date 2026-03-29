#ifndef LOG_HPP
#define LOG_HPP

#include <Arduino.h>
#include <string>
#include <sstream>
#include <iomanip>

void log(std::string data) {
    double seconds = static_cast<double>(esp_timer_get_time()) / 1000000.0;
    std::ostringstream timeStr;
    timeStr << std::fixed << std::setprecision(8) << seconds;

    std::stringstream stream;
    stream << "[" << timeStr.str() << "] [netsocket] " << data << "\n";
    Serial.print(stream.str().c_str());
    stream.flush();
}

#endif
#include "imgui/imgui.h"
#include "imgui/imgui_impl_win32.h"
#include "imgui/imgui_impl_dx11.h"
#include <d3d11.h>
#include <tchar.h>
#include <iostream>
#include <string>
#include <vector>
#include <thread>
#include <chrono>
#include <sstream>
#include <functional>

#include "websocket/websocket.hpp"
#include "styling.hpp"
#include "config.hpp"

using namespace easywsclient;
WebSocket* Socket = nullptr;

// Data
static ID3D11Device* g_pd3dDevice = nullptr;
static ID3D11DeviceContext* g_pd3dDeviceContext = nullptr;
static IDXGISwapChain* g_pSwapChain = nullptr;
static bool g_SwapChainOccluded = false;
static UINT g_ResizeWidth = 0, g_ResizeHeight = 0;
static ID3D11RenderTargetView* g_mainRenderTargetView = nullptr;

// Forward declarations of helper functions
bool CreateDeviceD3D(HWND hWnd);
void CleanupDeviceD3D();
void CreateRenderTarget();
void CleanupRenderTarget();
LRESULT WINAPI WndProc(HWND hWnd, UINT msg, WPARAM wParam, LPARAM lParam);

#include <dwmapi.h>
MARGINS Margin = { -1 };
char inputBuf[256];

bool paletteHidden = false;

ImFont* font_lg;
ImFont* font_sm;
ImFont* font_vsm;
namespace notification {
    std::string unescape(const std::string& input) {
        std::ostringstream output;
        size_t i = 0;

        while (i < input.size()) {
            if (input[i] == '\\' && i + 1 < input.size()) {
                // Check the next character for the escape sequence
                switch (input[i + 1]) {
                case 'n':
                    output << '\n';
                    i += 2; // Skip over the '\' and 'n'
                    break;
                case 't':
                    output << '\t';
                    i += 2; // Skip over the '\' and 't'
                    break;
                case '\\':
                    output << '\\';
                    i += 2; // Skip over the '\' and '\'
                    break;
                case '\"':
                    output << '\"';
                    i += 2; // Skip over the '\' and '\"'
                    break;
                case '\'':
                    output << '\'';
                    i += 2; // Skip over the '\' and '\''
                    break;
                default:
                    // If not a known escape, keep the '\' and move to the next character
                    output << input[i];
                    i++;
                    break;
                }
            }
            else {
                output << input[i];
                i++;
            }
        }

        return output.str();
    }
    inline std::string rtrim(std::string& s) {
        s.erase(std::find_if(s.rbegin(), s.rend(), [](unsigned char ch) {
            return !std::isspace(ch);
            }).base(), s.end());
        return s;
    }
    float lerp(float a, float b, float alpha) {
        return (b - a) * alpha + a;
    }
    ImColor lerpColor(ImColor a, ImColor b = ImColor(0, 0, 0), float alpha = 0.5) {
        return ImColor(
            lerp(a.Value.x, b.Value.x, alpha),
            lerp(a.Value.y, b.Value.y, alpha),
            lerp(a.Value.z, b.Value.z, alpha)
        );
    }

    struct _t {
        std::string text = "";
        ImColor color = ImColor(50, 50, 50);
        float percentComplete = 0.0f;
        bool usableData = false;
        ImVec2 sz = ImVec2(-1, -1);
    };
    std::vector<_t> queue;
    std::string lastBigNotification = "";

    void addNotification(_t noti) {
        if (noti.usableData) {
            lastBigNotification = notification::unescape(noti.text);
        }
        noti.color = lerpColor(noti.color, ImColor(0, 0, 0, 0));
        noti.text = unescape(noti.text);
        queue.push_back(noti);
        std::cout << "[Notification] " << noti.text << std::endl;
    }

    float easeOutCubic(float x) {
        return x < 0.5 ? 4 * x * x * x : 1 - powf(-2 * x + 2, 3) / 2;
    }
    void tickAndRender() {
        int activeNotification = 0;
        for (int i = 0; i < queue.size(); i++) {
            if (queue[i].percentComplete > 1) 
                continue;
            queue[i].percentComplete += 0.0015;
            float windowAnim = min(1, max(0, queue[i].percentComplete * 10));
            ImGui::SetNextWindowPos(ImVec2(-(easeOutCubic(1 - windowAnim)) * 200, activeNotification));
            ImGui::PushStyleVar(ImGuiStyleVar_WindowRounding, 0.0f);
            ImGui::PushStyleVar(ImGuiStyleVar_WindowPadding, ImVec2(10, 10));
            if (queue[i].usableData)
                ImGui::PushFont(font_lg);
            ImGui::Begin((std::string("#notification_") + std::to_string(i)).c_str(), (bool*)0,
                ImGuiWindowFlags_NoMove |
                ImGuiWindowFlags_NoTitleBar |
                ImGuiWindowFlags_NoScrollbar |
                ImGuiWindowFlags_NoResize |
                ImGuiWindowFlags_AlwaysAutoResize
            );
            queue[i].sz = ImGui::GetWindowSize();
            const float maxGradientLenPx = ImGui::GetWindowSize().x / 1.5;
            const float gradientHeight = ImGui::GetWindowSize().y;
            for (float x = 0; x < maxGradientLenPx; x++) {
                ImGui::GetWindowDrawList()->AddLine(ImVec2(x, activeNotification), ImVec2(x, activeNotification + gradientHeight), lerpColor(queue[i].color, ImColor(0, 0, 0, 0), x / maxGradientLenPx));
            }
            ImGui::Text(rtrim(queue[i].text).c_str());
            if (queue[i].usableData) {
                ImGui::PushFont(font_vsm);
                ImGui::Text("Press Ctrl+Shift+1 to Copy ");
                ImGui::SameLine();
                ImGui::Text(" Press Ctrl+Shift+2 to Type");
                ImGui::PopFont();
            }
            ImGui::GetWindowDrawList()->AddLine(ImVec2(0, activeNotification), ImVec2(ImGui::GetWindowSize().x * easeOutCubic(queue[i].percentComplete), activeNotification), ImColor(255, 255, 255), 3);
            activeNotification += (ImGui::GetWindowSize().y);
            ImGui::End();
            if (queue[i].usableData)
                ImGui::PopFont();
            ImGui::PopStyleVar();
            ImGui::PopStyleVar();
        }
    }
}

struct preferences_t {
    std::string url = NETSOCKET_DEFAULT_HOST;
    bool shouldStartOnStartup = false;
    int retryMs = 500000;
} preferences;

bool isConnecting = false;
std::string connUrl = "Disconnected";
WebSocket::readyStateValues OpenConnection(const std::string url = preferences.url) {
    isConnecting = true;
    //notification::addNotification({ std::string("Connecting to server \"") + url + std::string("\"...") });
    WSADATA wsaData;
    if (WSAStartup(MAKEWORD(2, 2), &wsaData)) {
        exit(1);
    }
    Socket = WebSocket::from_url(url, "");
    int TimePassed = 0;
    bool success = true;
    while (Socket == nullptr || Socket->getReadyState() != WebSocket::OPEN) {
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
        TimePassed += 100;
        if (TimePassed > preferences.retryMs) {
            success = false;
            notification::addNotification({ std::string("Failed to connect to server \"") + url + std::string("\" after ") + std::to_string(preferences.retryMs) + std::string("ms"), ImColor(255, 0, 0)});
            OpenConnection(url);
            break;
        }
    }
    if (Socket && success) {
        notification::addNotification({ std::string("Connected to server \"") + url + std::string("\"!"), ImColor(0, 255, 0) });
        isConnecting = false;
        connUrl = url;
        return Socket->getReadyState();
    }
    return WebSocket::readyStateValues::CLOSED;
}

bool socketConnected() {
    return (Socket != nullptr && Socket->getReadyState() == WebSocket::OPEN);
}

HWND lastFocusedWindow;
HWND mainWindow;
bool shouldHidePalette = false;
void sendCommand(std::string cmd) {
    if (socketConnected()) {
        std::string buf(inputBuf);
        std::stringstream str;
        str << R"({ "broadcastPurpose": "command", "broadcastData": ")";
        str << buf;
        str << R"(" })";
        std::cout << str.str().c_str() << std::endl;
        Socket->send(str.str());
        ZeroMemory(&inputBuf, 256);
        shouldHidePalette = true;
    }
}
std::wstring GetExecutablePath() {
    wchar_t buffer[MAX_PATH];
    GetModuleFileNameW(NULL, buffer, MAX_PATH);
    return std::wstring(buffer);
}

bool focusStale = true;
char lastKeyDown = 0;
int textEditCallback(ImGuiInputTextCallbackData* data) {
    if (lastKeyDown && data->Buf) {
        //sendCommand(std::string(inputBuf));
        notification::addNotification({ std::to_string((int)lastKeyDown) });
        focusStale = true;
    }
    return 0;
}

namespace utils {
    void addToStartup() {
        std::wstring progPath = GetExecutablePath();
        HKEY hKey = NULL;
        LONG createStatus = RegCreateKey(HKEY_CURRENT_USER, L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run", &hKey);
        LONG status = RegSetValueEx(hKey, L"netsocket", 0, REG_SZ, (BYTE*)progPath.c_str(), (progPath.size() + 1) * sizeof(wchar_t));
    }
    void removeFromStartup() {
        std::wstring progPath = GetExecutablePath();
        HKEY hKey = NULL;
        LONG createStatus = RegCreateKey(HKEY_CURRENT_USER, L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run", &hKey);
        LONG status = RegDeleteValue(hKey, L"netsocket");
    }
}

class hotkey {
    std::function<bool()> condition = nullptr;
    std::function<void()> call = nullptr;
    std::chrono::steady_clock::time_point lastDetectedTime;
    int delay = 250; // ms
public:
    void poll() {
        if (!condition || !call) return;
        std::chrono::steady_clock::time_point currentTime = std::chrono::high_resolution_clock::now();
        if (this->condition() && std::chrono::duration<double, std::milli>(currentTime - lastDetectedTime).count() > delay) {
            this->call();
            lastDetectedTime = std::chrono::high_resolution_clock::now();
        }
    }
    hotkey(std::function<bool()> newCondition, std::function<void()> newCall) {
        condition = newCondition;
        call = newCall;
    }
};

int main(int, char**) {

#ifdef _DEBUG
    ShowWindow(GetConsoleWindow(), SW_SHOW);
#else
    ShowWindow(GetConsoleWindow(), SW_HIDE);
#endif

    // Make process DPI aware and obtain main monitor scale
    ImGui_ImplWin32_EnableDpiAwareness();
    float devicePixelRatio = ImGui_ImplWin32_GetDpiScaleForMonitor(::MonitorFromPoint(POINT{ 0, 0 }, MONITOR_DEFAULTTOPRIMARY));

    // Create application window
    WNDCLASS wc = { };
    wc.lpfnWndProc = WndProc;
    wc.hInstance = NULL;
    wc.lpszClassName = L"netsocket";
    RegisterClass(&wc);
    lastFocusedWindow = GetForegroundWindow();
    HWND hwnd = CreateWindowW(wc.lpszClassName, L"netsocket", WS_POPUP | WS_VISIBLE, 100, 100, (int)(1280 * devicePixelRatio), (int)(800 * devicePixelRatio), nullptr, nullptr, wc.hInstance, nullptr);
    DwmExtendFrameIntoClientArea(hwnd, &Margin);

    // Initialize Direct3D
    if (!CreateDeviceD3D(hwnd)) {
        CleanupDeviceD3D();
        ::UnregisterClass(wc.lpszClassName, wc.hInstance);
        return 1;
    }

    // Show the window
    SetWindowLong(hwnd, GWL_EXSTYLE, WS_EX_TRANSPARENT);
    //SetWindowLong(hwnd, GWL_EXSTYLE, WS_EX_TRANSPARENT | WS_EX_LAYERED | WS_EX_TOPMOST);
    SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, GetSystemMetrics(SM_CXSCREEN), GetSystemMetrics(SM_CYSCREEN), NULL);
    ShowWindow(hwnd, SW_SHOW);
    UpdateWindow(hwnd);
    mainWindow = hwnd;

    // Setup Dear ImGui context
    IMGUI_CHECKVERSION();
    ImGui::CreateContext();
    ImGuiIO& io = ImGui::GetIO(); (void)io;
    io.ConfigInputTextEnterKeepActive = true;
    font_sm = io.Fonts->AddFontFromFileTTF("c:\\Windows\\Fonts\\segoeui.ttf", 18.0f, NULL, io.Fonts->GetGlyphRangesDefault());
    font_lg = io.Fonts->AddFontFromFileTTF("c:\\Windows\\Fonts\\seguisb.ttf", 36.0f, NULL, io.Fonts->GetGlyphRangesDefault());
    font_vsm = io.Fonts->AddFontFromFileTTF("c:\\Windows\\Fonts\\segoeui.ttf", 12.0f, NULL, io.Fonts->GetGlyphRangesDefault());

    notification::addNotification({"Started netsocket!"});

    // Setup Dear ImGui style
    ImGui::StyleColorsDark();
    //ImGui::StyleColorsLight();

    // Setup scaling
    SetStyle();
    ImGuiStyle& style = ImGui::GetStyle();
    style.ScaleAllSizes(devicePixelRatio);
    style.FontScaleDpi = devicePixelRatio;
    style.WindowPadding = ImVec2(0, 0);

    // Setup Platform/Renderer backends
    ImGui_ImplWin32_Init(hwnd);
    ImGui_ImplDX11_Init(g_pd3dDevice, g_pd3dDeviceContext);

    // Hide/show palette
    static auto showPalette = [&](HWND hwnd) -> void {
        lastFocusedWindow = GetForegroundWindow();
        if (Socket != nullptr && Socket->getReadyState() != WebSocket::OPEN) {
            std::cout << Socket->getReadyState() << std::endl;
            notification::addNotification({ "netsocket is currently disconnected!" });
        }
        SetWindowLong(hwnd, GWL_EXSTYLE, WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW);
        SetForegroundWindow(hwnd);
        focusStale = true;
        paletteHidden = false;
        };
    static auto hidePalette = [&](HWND hwnd) -> void {
        SetWindowLong(hwnd, GWL_EXSTYLE, WS_EX_TRANSPARENT | WS_EX_LAYERED | WS_EX_TOPMOST | WS_EX_TOOLWINDOW);
        SetForegroundWindow(lastFocusedWindow);
        paletteHidden = true;
    };

    std::vector<hotkey*> registeredKeys;
    registeredKeys.push_back(new hotkey([]() -> bool {
        return (
            GetAsyncKeyState(VK_LCONTROL) && 
            GetAsyncKeyState(VK_LSHIFT) && 
            GetAsyncKeyState(VK_SPACE)
        ) || (!paletteHidden && GetAsyncKeyState(VK_ESCAPE));
    }, [&]() {
        if (paletteHidden)
            showPalette(hwnd);
        else {
            hidePalette(hwnd);
        }
    }));

    std::thread t(OpenConnection, preferences.url   );

    // Main loop
    bool done = false;
    ImVec2 paletteSize;

    while (!done) {

        for (hotkey* key : registeredKeys) {
            key->poll();
        }

        // Notification actions
        if (GetAsyncKeyState(VK_LCONTROL) && GetAsyncKeyState(VK_LSHIFT) && GetAsyncKeyState('1') & 1) {
            // Copy text
            const char* output = notification::lastBigNotification.c_str();
            const size_t len = strlen(output) + 1;
            HGLOBAL hMem = GlobalAlloc(GMEM_MOVEABLE, len);
            memcpy(GlobalLock(hMem), output, len);
            GlobalUnlock(hMem);
            OpenClipboard(0);
            EmptyClipboard();
            SetClipboardData(CF_TEXT, hMem);
            CloseClipboard();
        }
        if (GetAsyncKeyState(VK_LCONTROL) && GetAsyncKeyState(VK_LSHIFT) && GetAsyncKeyState('2') & 1) {
            // Type text
            std::this_thread::sleep_for(std::chrono::milliseconds(500));
            for (char c : notification::lastBigNotification) {
                SHORT vk = VkKeyScanA(c);

                INPUT inputs[2] = {};
                inputs[0].type = INPUT_KEYBOARD;
                inputs[0].ki.wVk = vk;
                inputs[1].type = INPUT_KEYBOARD;
                inputs[1].ki.wVk = vk;
                inputs[1].ki.dwFlags = KEYEVENTF_KEYUP;
                SendInput(2, inputs, sizeof(INPUT));
            }
        }

        // Poll socket for data
        if (Socket != nullptr && Socket->getReadyState() != WebSocket::CLOSED) {
            Socket->poll();
            Socket->dispatchBinary([](const std::vector<unsigned char>& BinaryData) {
                std::string data = std::string(BinaryData.begin(), BinaryData.end());
                if (data.find(R"("overlay")") != std::string::npos) {
                    data = data.substr(47);
                    data = data.substr(0, data.find("\""));
                    notification::addNotification({ data, ImColor(50, 50, 50), 0.0f, true });
                }
            });
        }

        // Send command
        if (GetAsyncKeyState(VK_RETURN) && !paletteHidden && std::string(inputBuf).length() > 0) {
            sendCommand(std::string(inputBuf));
        }
        if (shouldHidePalette) {
            hidePalette(hwnd);
            shouldHidePalette = false;
        }

        // Poll and handle messages (inputs, window resize, etc.)
        // See the WndProc() function below for our to dispatch events to the Win32 backend.
        MSG msg;
        while (::PeekMessage(&msg, nullptr, 0U, 0U, PM_REMOVE))
        {
            ::TranslateMessage(&msg);
            ::DispatchMessage(&msg);
            if (msg.message == WM_QUIT)
                done = true;
        }
        if (done)
            break;

        // Handle window being minimized or screen locked
        if (g_SwapChainOccluded && g_pSwapChain->Present(0, DXGI_PRESENT_TEST) == DXGI_STATUS_OCCLUDED)
        {
            ::Sleep(10);
            continue;
        }
        g_SwapChainOccluded = false;

        // Handle window resize (we don't resize directly in the WM_SIZE handler)
        if (g_ResizeWidth != 0 && g_ResizeHeight != 0)
        {
            CleanupRenderTarget();
            g_pSwapChain->ResizeBuffers(0, g_ResizeWidth, g_ResizeHeight, DXGI_FORMAT_UNKNOWN, 0);
            g_ResizeWidth = g_ResizeHeight = 0;
            CreateRenderTarget();
        }

        // Start the Dear ImGui frame
        ImGui_ImplDX11_NewFrame();
        ImGui_ImplWin32_NewFrame();
        ImGui::NewFrame();

        if (!paletteHidden) {
            ImVec2 palettePos;
            ImGui::PushFont(font_lg);
            ImGui::SetNextWindowPos(ImVec2(
                io.DisplaySize.x / 2 - paletteSize.x / 2,
                io.DisplaySize.y / 2 - paletteSize.y / 2
            ));
            ImGui::Begin("#InputWindow", (bool*)NULL,
                ImGuiWindowFlags_NoMove |
                ImGuiWindowFlags_NoTitleBar |
                ImGuiWindowFlags_NoScrollbar |
                ImGuiWindowFlags_NoResize |
                ImGuiWindowFlags_AlwaysAutoResize
            );
            if (!ImGui::IsAnyItemActive()) {
                ImGui::SetKeyboardFocusHere(0);
            }
            ImGui::SetNextItemWidth(GetSystemMetrics(SM_CXSCREEN) / 2);
            ImGui::InputText(" ", inputBuf, 256,
                ImGuiInputTextFlags_ElideLeft
            );
            paletteSize = ImGui::GetWindowSize();
            palettePos = ImGui::GetWindowPos();
            ImGui::GetForegroundDrawList()->AddLine(ImVec2(ImGui::GetWindowPos().x, ImGui::GetWindowPos().y + ImGui::GetWindowSize().y), ImVec2(ImGui::GetWindowPos().x + ImGui::GetWindowSize().x, ImGui::GetWindowPos().y + ImGui::GetWindowSize().y), socketConnected() ? ImColor(50, 255, 50) : ImColor(255, 50, 50), 2);
            ImGui::End();
            ImGui::PopFont();
            ImGui::PushFont(font_vsm);
            ImGui::GetForegroundDrawList()->AddText(ImVec2(palettePos.x, palettePos.y - 20), ImColor(255, 255, 255, 100), connUrl.c_str());
            ImGui::PopFont();
        }

        notification::tickAndRender();

        // Rendering
        ImGui::Render();
        const float color[4] = { 0.f, 0.f, 0.f, 0.f };
        g_pd3dDeviceContext->OMSetRenderTargets(1, &g_mainRenderTargetView, NULL);
        g_pd3dDeviceContext->ClearRenderTargetView(g_mainRenderTargetView, color);
        ImGui_ImplDX11_RenderDrawData(ImGui::GetDrawData());

        // Present
        HRESULT hr = g_pSwapChain->Present(1, 0);   // Present with vsync
        //HRESULT hr = g_pSwapChain->Present(0, 0); // Present without vsync
        g_SwapChainOccluded = (hr == DXGI_STATUS_OCCLUDED);
    }

    // Cleanup
    ImGui_ImplDX11_Shutdown();
    ImGui_ImplWin32_Shutdown();
    ImGui::DestroyContext();

    CleanupDeviceD3D();
    DestroyWindow(hwnd);
    UnregisterClass(wc.lpszClassName, wc.hInstance);

    return 0;
}

// Helper functions

bool CreateDeviceD3D(HWND hWnd) {
    DXGI_SWAP_CHAIN_DESC sd;
    ZeroMemory(&sd, sizeof(sd));
    sd.BufferCount = 2;
    sd.BufferDesc.Width = 0;
    sd.BufferDesc.Height = 0;
    sd.BufferDesc.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
    sd.BufferDesc.RefreshRate.Numerator = 360;
    sd.BufferDesc.RefreshRate.Denominator = 1;
    sd.Flags = DXGI_SWAP_CHAIN_FLAG_ALLOW_MODE_SWITCH;
    sd.BufferUsage = DXGI_USAGE_RENDER_TARGET_OUTPUT;
    sd.OutputWindow = hWnd;
    sd.SampleDesc.Count = 1;
    sd.SampleDesc.Quality = 0;
    sd.Windowed = TRUE;
    sd.SwapEffect = DXGI_SWAP_EFFECT_DISCARD;

    UINT createDeviceFlags = 0;
    D3D_FEATURE_LEVEL featureLevel;
    const D3D_FEATURE_LEVEL featureLevelArray[2] = { D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_10_0, };
    HRESULT res = D3D11CreateDeviceAndSwapChain(nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr, createDeviceFlags, featureLevelArray, 2, D3D11_SDK_VERSION, &sd, &g_pSwapChain, &g_pd3dDevice, &featureLevel, &g_pd3dDeviceContext);
    if (res == DXGI_ERROR_UNSUPPORTED)
        res = D3D11CreateDeviceAndSwapChain(nullptr, D3D_DRIVER_TYPE_WARP, nullptr, createDeviceFlags, featureLevelArray, 2, D3D11_SDK_VERSION, &sd, &g_pSwapChain, &g_pd3dDevice, &featureLevel, &g_pd3dDeviceContext);
    if (res != S_OK)
        return false;

    CreateRenderTarget();
    return true;
}

void CleanupDeviceD3D() {
    CleanupRenderTarget();
    if (g_pSwapChain) { g_pSwapChain->Release(); g_pSwapChain = nullptr; }
    if (g_pd3dDeviceContext) { g_pd3dDeviceContext->Release(); g_pd3dDeviceContext = nullptr; }
    if (g_pd3dDevice) { g_pd3dDevice->Release(); g_pd3dDevice = nullptr; }
}

void CreateRenderTarget() {
    ID3D11Texture2D* pBackBuffer;
    g_pSwapChain->GetBuffer(0, IID_PPV_ARGS(&pBackBuffer));
    g_pd3dDevice->CreateRenderTargetView(pBackBuffer, NULL, &g_mainRenderTargetView);
    pBackBuffer->Release();
}

void CleanupRenderTarget() {
    if (g_mainRenderTargetView) { g_mainRenderTargetView->Release(); g_mainRenderTargetView = nullptr; }
}

extern IMGUI_IMPL_API LRESULT ImGui_ImplWin32_WndProcHandler(HWND hWnd, UINT msg, WPARAM wParam, LPARAM lParam);
LRESULT WINAPI WndProc(HWND hWnd, UINT msg, WPARAM wParam, LPARAM lParam)
{
    if (msg == WM_KEYDOWN)
        lastKeyDown = wParam;

    if (!paletteHidden)
        if (ImGui_ImplWin32_WndProcHandler(hWnd, msg, wParam, lParam))
            return true;

    switch (msg)
    {
    case WM_SIZE:
        if (wParam == SIZE_MINIMIZED)
            return 0;
        g_ResizeWidth = (UINT)LOWORD(lParam); // Queue resize
        g_ResizeHeight = (UINT)HIWORD(lParam);
        return 0;
    case WM_SYSCOMMAND:
        if ((wParam & 0xfff0) == SC_KEYMENU) // Disable ALT application menu
            return 0;
        break;
    case WM_DESTROY:
        ::PostQuitMessage(0);
        return 0;
    }
    return ::DefWindowProcW(hWnd, msg, wParam, lParam);
}

#include "imgui/imgui.h"

ImVec4 MakeStyle(ImVec4 Color, float Multiplier, float AlphaMultiplier) {
    return ImVec4(Color.x * Multiplier, Color.y * Multiplier, Color.z * Multiplier, Color.w * AlphaMultiplier);
}
void SetStyle() {
    ImGuiStyle* Style = &ImGui::GetStyle();
    Style->WindowPadding = ImVec2(10, 10);
    Style->FramePadding = ImVec2(15, 10);
    Style->CellPadding = ImVec2(10, 10);
    Style->ItemSpacing = ImVec2(10, 10);
    Style->ItemInnerSpacing = ImVec2(8, 8);
    Style->TouchExtraPadding = ImVec2(0, 0);
    Style->IndentSpacing = 30;
    Style->ScrollbarSize = 15;
    Style->GrabMinSize = 27;
    Style->WindowBorderSize = 1;
    Style->ChildBorderSize = 0;
    Style->PopupBorderSize = 1;
    Style->FrameBorderSize = 0;
    Style->TabBorderSize = 0;
    Style->ChildRounding = 0;
    Style->LogSliderDeadzone = 4;
    Style->WindowTitleAlign = ImVec2(0.0, 0.5);
    Style->WindowMenuButtonPosition = ImGuiDir_None;
    Style->ColorButtonPosition = ImGuiDir_Right;
    Style->ButtonTextAlign = ImVec2(0.5, 0.5);
    Style->SelectableTextAlign = ImVec2(0, 0);
    Style->DisplaySafeAreaPadding = ImVec2(3, 3);
    Style->DisplayWindowPadding = ImVec2(300, 300);

    Style->CircleTessellationMaxError = 0.10f;

    ImVec4* Colors = Style->Colors;
    auto White = ImVec4(1.0f, 1.0f, 1.0f, 1.0f);
    auto Black = ImVec4(0.0f, 0.0f, 0.0f, 1.0f);
    auto Transparent = ImVec4(0, 0, 0, 0);
    ImVec4 AccentColor = ImVec4(0.0f, 0.0f, 0.0f, 1.0f); // Convert to ImVec4
    Colors[ImGuiCol_Text] = White;
    Colors[ImGuiCol_TextDisabled] = MakeStyle(White, 1, 0.5);
    Colors[ImGuiCol_WindowBg] = MakeStyle(Black, 1, 0.95);
    Colors[ImGuiCol_ChildBg] = Transparent;
    Colors[ImGuiCol_PopupBg] = Transparent;
    Colors[ImGuiCol_Border] = MakeStyle(AccentColor, 1, 0.5);
    Colors[ImGuiCol_BorderShadow] = MakeStyle(Black, 1, 0.5);
    Colors[ImGuiCol_FrameBg] = Transparent;
    Colors[ImGuiCol_FrameBgHovered] = MakeStyle(AccentColor, 1, 0.4);
    Colors[ImGuiCol_FrameBgActive] = MakeStyle(AccentColor, 1, 0.6);
    Colors[ImGuiCol_TitleBg] = Transparent;
    Colors[ImGuiCol_TitleBgActive] = MakeStyle(Black, 1, 0.9);
    Colors[ImGuiCol_TitleBgCollapsed] = MakeStyle(Black, 1, 0.9);
    Colors[ImGuiCol_MenuBarBg] = Transparent;
    Colors[ImGuiCol_ScrollbarBg] = Transparent;
    Colors[ImGuiCol_ScrollbarGrab] = MakeStyle(AccentColor, 1, 0.25);
    Colors[ImGuiCol_ScrollbarGrabHovered] = MakeStyle(AccentColor, 1, 0.4);
    Colors[ImGuiCol_ScrollbarGrabActive] = MakeStyle(AccentColor, 1, 0.6);
    Colors[ImGuiCol_CheckMark] = AccentColor;
    Colors[ImGuiCol_SliderGrab] = MakeStyle(AccentColor, 0.8, 1);
    Colors[ImGuiCol_SliderGrabActive] = MakeStyle(AccentColor, 1, 1);
    Colors[ImGuiCol_Button] = MakeStyle(AccentColor, 1, 0.25);
    Colors[ImGuiCol_ButtonHovered] = MakeStyle(AccentColor, 1, 0.4);
    Colors[ImGuiCol_ButtonActive] = MakeStyle(AccentColor, 1, 0.6);
    Colors[ImGuiCol_Header] = MakeStyle(AccentColor, 1, 0.25);
    Colors[ImGuiCol_HeaderHovered] = MakeStyle(AccentColor, 1, 0.4);
    Colors[ImGuiCol_HeaderActive] = MakeStyle(AccentColor, 1, 0.6);
    Colors[ImGuiCol_Separator] = MakeStyle(AccentColor, 1, 0.25);
    Colors[ImGuiCol_SeparatorHovered] = MakeStyle(AccentColor, 1, 0.25);
    Colors[ImGuiCol_SeparatorActive] = MakeStyle(AccentColor, 1, 0.25);
    Colors[ImGuiCol_ResizeGrip] = MakeStyle(AccentColor, 1, 0.25);
    Colors[ImGuiCol_ResizeGripHovered] = MakeStyle(AccentColor, 1, 0.4);
    Colors[ImGuiCol_ResizeGripActive] = MakeStyle(AccentColor, 1, 0.6);
    Colors[ImGuiCol_Tab] = MakeStyle(AccentColor, 1, 0.25);
    Colors[ImGuiCol_TabHovered] = MakeStyle(AccentColor, 1, 0.4);
    Colors[ImGuiCol_TabActive] = MakeStyle(AccentColor, 1, 0.6);
    Colors[ImGuiCol_TabUnfocused] = MakeStyle(AccentColor, 1, 0.25);
    Colors[ImGuiCol_TabUnfocusedActive] = MakeStyle(AccentColor, 1, 0.6);
}
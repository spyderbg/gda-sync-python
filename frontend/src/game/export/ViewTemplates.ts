// The C++ sources of a game's view module that do not depend on its views, made from
// alpha_family/plugins/burning_crown_tetra_spins_10/src/Egt/BurningCrownTetraSpins10View with the game's name in place
// of BurningCrownTetraSpins10. The .cpp takes the views' includes and the body of CreateViews().

export function ViewModuleH(game: string): string {
  return `#pragma once

#include <Egt/AlphaFamilyVideoCtrl/BaseView.h>
#include <Egt/ImGuiEx/Extensions/Utils.h>
#include <Egt/ModuleManager/BaseModule.h>

#include <video_ctrl/draw_list.h>

namespace Egt::Game::AlphaFamily
{
    class ${game}View : public BaseModule
    {
    public:
        explicit ${game}View();
        virtual ~${game}View();

        // IModule
        bool Init(GameCore::RuntimeAccess, const Core::Json& config) final;
        bool PostInit() final;
        void PreDeinit() final;
        void Deinit() final;
        void Process() final;
        void PostProcess() final;
        void ImGuiDraw() final;

    private:
        void Draw(video_ctrl::draw_list& drawList);
        bool HandleOsEvent(const os::event& e);
        bool HandleTouchDown(int x, int y);
        bool HandleTouchUp(int x, int y);
        void OnImGuiMainMenuBar();

        void OnFileChanged(const Fs::path&);
        void CreateViews();

    private:
        std::vector<Ptr<BaseView>> m_views;

        ImGuiEx::SBool m_imguiWindowOpen = {"${game}View_open"};
    };
}
`;
}

export function ViewModuleCMakeLists(): string {
  return `# cmake-format: off
egt_create_static_library(
    LINK_LIBRARIES
    EgtAlphaFamilyStatic
    EgtAlphaFamilyVideoCtrlStatic
    tweeny
)
# cmake-format: on
`;
}

export function ViewModuleCpp(game: string, includes: string, createViews: string): string {
  return `#include "${game}View.h"

${includes}

#include <Egt/ImGuiEx/ImGuiEx.h>

#include <Egt/Game/RuntimeExport/IDebugOverlay.h>
#include <Egt/Game/RuntimeExport/IFileWatch.h>
#include <Egt/Game/RuntimeExport/IResources.h>
#include <Egt/GameVideoCtrl/RuntimeExport/IVideo.h>

#include <Egt/GameCore/Common/Defensive.h>

namespace Egt::Game::AlphaFamily
{
    using std::ranges::any_of;
    using std::ranges::for_each;

    ${game}View::${game}View() = default;
    ${game}View::~${game}View() = default;

    bool ${game}View::Init(GameCore::RuntimeAccess runtime, const Core::Json& config)
    {
        AssertReturnUnless(BaseModule::Init(std::move(runtime), config), false);

        CreateViews();

        for_each(m_views, [&](auto& view) {
            view->Init(GetRuntime());
        });

        m_imguiWindowOpen.Load();

        return true;
    }

    bool ${game}View::PostInit()
    {
        AssertReturnUnless(BaseModule::PostInit(), false);

        if (auto debugOverlay = RuntimeTryGetConst<IDebugOverlay::Events>())
        {
            RegisterInstant(debugOverlay->imguiMainMenuBar, this, &${game}View::OnImGuiMainMenuBar);
        }

        if (auto video = RuntimeTryGet<IVideo>())
        {
            video->RegisterDrawMain(
                [this](os::event e) -> bool {
                    return this->HandleOsEvent(e);
                },
                [this](video_ctrl::draw_list& drawlist) -> void {
                    this->Draw(drawlist);
                });
        }

        if (const auto fileWatchEvents = RuntimeTryGet<IFileWatch::Events>())
        {
            RegisterInstant(fileWatchEvents->fileChanged, this, &${game}View::OnFileChanged);
        }

        return true;
    }

    void ${game}View::PreDeinit()
    {
        if (auto video = RuntimeTryGet<IVideo>())
        {
            video->UnregisterDrawMain();
        }
        BaseModule::PreDeinit();
    }

    void ${game}View::Deinit()
    {
        for_each(m_views | std::views::reverse, [](auto& view) {
            view->Deinit();
        });

        BaseModule::Deinit();
    }

    void ${game}View::Process()
    {
        BaseModule::Process();

        for_each(m_views, [](auto& view) {
            view->Process();
        });
    }

    void ${game}View::PostProcess()
    {
        BaseModule::PostProcess();
    }

    void ${game}View::Draw(video_ctrl::draw_list& drawList)
    {
        for_each(m_views, [&drawList](auto& view) {
            view->Draw(drawList);
        });
    }

    void ${game}View::ImGuiDraw()
    {
        BaseModule::ImGuiDraw();

        if (m_imguiWindowOpen())
        {
            ImGui::SetNextWindowPos(ImVec2(890, 50), ImGuiCond_FirstUseEver);
            ImGui::SetNextWindowSize(ImVec2(700, 840), ImGuiCond_FirstUseEver);
            if (ImGui::Begin("${game}View", &m_imguiWindowOpen(), ImGuiWindowFlags_None))
            {
                for_each(m_views, [](auto& view) {
                    if (ImGui::CollapsingHeader(view->GetName().c_str()))
                    {
                        view->ImGuiDraw();
                    }
                });
            }
            ImGui::End();
        }

        m_imguiWindowOpen.Save();
    }

    bool ${game}View::HandleOsEvent(const os::event& e)
    {
        bool captured = false;
        auto& video = RuntimeGetConst<IVideo>();
        if (e.type == os::events::mouse_button)
        {
            auto& b = e.button;

            const auto pos = video.GetTransform().inverse_transform_coord(glm::vec2(b.x, b.y));
            auto x = int32_t(pos.x);
            auto y = int32_t(pos.y);

            if (b.button == os::mouse::button::left)
            {
                switch (b.state_id)
                {
                case os::state::pressed: captured |= HandleTouchDown(x, y); break;
                case os::state::released: captured |= HandleTouchUp(x, y); break;
                default: break;
                }
            }
        }
        return captured;
    }

    bool ${game}View::HandleTouchDown(int x, int y)
    {
        return any_of(m_views | std::views::reverse, [x, y](auto& view) {
            return view->HandleTouchDown(x, y);
        });
    }

    bool ${game}View::HandleTouchUp(int x, int y)
    {
        return any_of(m_views | std::views::reverse, [x, y](auto& view) {
            return view->HandleTouchUp(x, y);
        });
    }

    void ${game}View::OnImGuiMainMenuBar()
    {
        if (ImGui::BeginMainMenuBar())
        {
            if (ImGui::BeginMenu("Game"))
            {
                if (ImGui::MenuItem("${game}View"))
                {
                    m_imguiWindowOpen() = true;
                }
                ImGui::EndMenu();
            }
            ImGui::EndMainMenuBar();
        }
    }

    void ${game}View::OnFileChanged(const Fs::path& filepath)
    {
        for_each(m_views, [&filepath](auto& view) {
            view->HandleFileChanged(filepath);
        });
    }

    void ${game}View::CreateViews()
    {
${createViews}    }
}
`;
}

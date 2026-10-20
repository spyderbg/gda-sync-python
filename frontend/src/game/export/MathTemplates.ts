// The C++ sources of a game's math module that do not depend on its rules, made from
// alpha_family/plugins/burning_crown_tetra_spins_10/src/Egt/BurningCrownTetraSpins10Math with the game's names in
// place of BurningCrownTetraSpins10 and BurningCrown. MathRules.cpp takes its generated CreateRules() and priorities.
/* eslint-disable */

export interface MathTemplateNames {
  game: string;
  simulatorName: string;
}

/** The files by their path in the module's folder (<game>Math). */
export function MathModuleFiles({ game, simulatorName }: MathTemplateNames): Record<string, string> {
  void simulatorName;
  return {
    [`MathRules.h`]: `#pragma once

#include <Egt/${game}Math/MathRules.data.h>

#include <Egt/AlphaFamily/Math/Reel/VisualAnalyse/VisualAnalyze.data.h>
#include <Egt/AlphaFamily/RuntimeExport/IMathRules.h>
#include <Egt/ModuleManager/IModule.h>

#include <map>
#include <memory>

namespace Egt::Game::AlphaFamily
{
    class ${game}Math;

    class MathRules : public IMathRules
    {
        using ReelRoundRulesContainer = std::map<RoundType, Ptr<ReelRoundRules>>;
        using WheelRoundRulesContainer = std::map<RoundType, Ptr<WheelRoundRules>>;

    public:
        explicit MathRules(${game}Math&);
        virtual ~MathRules();

        void Init(const MathRulesInitConfig& rulesConfig);
        void Deinit();

        // IMathRules interface
        const std::vector<RoundType>& GetAvailableRoundTypes() const final;
        const std::map<RoundType, int>& GetConsecutiveRoundTypePriorities() const;

        bool HasReelRoundRules(RoundType) const final;
        const ReelRoundRules& GetReelRoundRules(RoundType) const final;
        bool HasHoldAndSpinRules(RoundType) const final;
        const HoldAndSpinRoundRules& GetHoldAndSpinRoundRules(RoundType) const final;
        bool HasWheelRoundRules(RoundType) const final;
        const WheelRoundRules& GetWheelRoundRules(RoundType) const final;

    private:
        void CreateRules(const MathRulesInitConfig& rulesConfig);
        void CollectConsecutiveRoundTypePriorities();
        void CollectAvailableRoundTypes();

    private:
        ${game}Math& m_math;
        ReelRoundRulesContainer m_reelRoundRules;
        WheelRoundRulesContainer m_wheelRoundRules;
        std::vector<RoundType> m_availableRoundTypes;
        std::map<RoundType, int> m_consecutiveRoundTypePriorities;
    };
}
`,
    [`MathRules.data.h`]: `#pragma once

#include <Egt/AlphaFamily/DllExport.h>

#include <Egt/Core/Data/Data.h>

namespace Egt::Game::AlphaFamily
{
    struct EGT_ALPHAFAMILY_EXPORT MathRulesInitConfig
    {
        std::string id;
        double simRtp = 0.0f;
        std::optional<int> minCap = std::nullopt;
        std::optional<int> maxCap = std::nullopt;
        std::string mathFileId;
    };

    struct EGT_ALPHAFAMILY_EXPORT FakeReelsConfig : Data<FakeReelsConfig>
    {
        std::vector<std::vector<int>> fakeReels = {};
        int animationCoinThreshold = 0;
    };
}
`,
    [`MathTypes.h`]: `#pragma once

#include <Egt/ModuleManager/IModule.h>

#include <Egt/Game/RuntimeExport/IMathTypes.h>

#include <map>
#include <memory>

namespace Egt::Game::AlphaFamily
{
    class ${game}Math;

    class MathTypes : public IMathTypes
    {
    public:
        explicit MathTypes(${game}Math&);
        virtual ~MathTypes();

        void Init();
        void Deinit();

        // IMathTypes interface
        std::vector<Game::RoundType> GetAvailableRoundTypes() const final;
        Game::RoundType GetMainRoundType() const final;
        std::string GetRoundTypeName(Game::RoundType) const final;
        Game::CurrencyType GetCreditsCurrencyType() const final;
        std::string GetCurrencyName(Game::CurrencyType) const final;

    private:
        ${game}Math& m_math;
    };
}
`,
    [`MathTypes.cpp`]: `#include "MathTypes.h"

#include <Egt/${game}Math/${game}Math.h>

#include <Egt/AlphaFamily/Math/Common/Common.data.h>
#include <Egt/AlphaFamily/RuntimeExport/IMathRules.h>

#include <Egt/GameCore/Common/Defensive.h>
#include <Egt/GameCore/Log/LogCategory.h>

#include <Egt/Core/Plugin/ObjectFactory.h>

#include <ranges>

namespace Egt::Game::AlphaFamily
{
    namespace
    {
        EgtLogCategory(AutoLogCategory, "${game}Math.MathTypes");
    }

    MathTypes::MathTypes(${game}Math& math)
        : m_math(math)
    {
    }

    MathTypes::~MathTypes() = default;

    void MathTypes::Init()
    {
        m_math.RuntimeAdd<IMathTypes>(this);
    }

    void MathTypes::Deinit()
    {
        m_math.RuntimeRemove<IMathTypes>();
    }

    std::vector<Game::RoundType> MathTypes::GetAvailableRoundTypes() const
    {
        auto& rules = m_math.RuntimeGet<IMathRules>();
        auto& roundTypes = rules.GetAvailableRoundTypes();

        std::vector<Game::RoundType> result;
        std::ranges::transform(roundTypes, std::back_inserter(result), [](auto rt) {
            return Game::RoundType(rt);
        });
        return result;
    }

    Game::RoundType MathTypes::GetMainRoundType() const
    {
        return static_cast<Game::RoundType>(RoundType::Main);
    }

    std::string MathTypes::GetRoundTypeName(Game::RoundType roundType) const
    {
        return format_as(static_cast<RoundType>(roundType));
    }

    CurrencyType MathTypes::GetCreditsCurrencyType() const
    {
        return Currency::Credits;
    }

    std::string MathTypes::GetCurrencyName(CurrencyType currencyType) const
    {
        return Currency::ToString(currencyType);
    }
}
`,
    [`${game}Math.h`]: `#pragma once

#include <Egt/${game}Math/MathRules.data.h>

#include <Egt/ModuleManager/BaseModule.h>

namespace Egt::Game::AlphaFamily
{
    class MathRules;
    class MathTypes;

    class ${game}Math : public BaseModule
    {
    public:
        virtual ~${game}Math();

        // IModule
        bool Init(GameCore::RuntimeAccess, const Core::Json& config) final;
        void Deinit() final;

    private:
        MathRulesInitConfig ChooseMathFile(const Core::Json& config) const;

    private:
        Ptr<MathTypes> m_mathTypes;
        Ptr<MathRules> m_mathRules;
    };
}
`,
    [`${game}Math.cpp`]: `#include "${game}Math.h"

#include <Egt/${game}Math/MathRules.h>
#include <Egt/${game}Math/MathTypes.h>

#include <Egt/ImGuiEx/ImGuiEx.h>

#include <Egt/Game/RuntimeImport/IAppControl.h>

#include <Egt/GameCore/Common/Defensive.h>

#include <Egt/Core/Tools/Filesystem.h>

#include <fstream>

namespace Egt::Game::AlphaFamily
{

    ${game}Math::~${game}Math() = default;

    bool ${game}Math::Init(GameCore::RuntimeAccess runtime, const Core::Json& config)
    {
        AssertReturnUnless(BaseModule::Init(std::move(runtime), config), false);

        m_mathTypes = std::make_shared<MathTypes>(*this);
        m_mathTypes->Init();

        m_mathRules = std::make_shared<MathRules>(*this);
        m_mathRules->Init(ChooseMathFile(config));

        return true;
    }

    void ${game}Math::Deinit()
    {
        m_mathRules->Deinit();
        m_mathRules.reset();

        m_mathTypes->Deinit();
        m_mathTypes.reset();

        BaseModule::Deinit();
    }

    MathRulesInitConfig ${game}Math::ChooseMathFile(const Core::Json& config) const
    {
        MathRulesInitConfig result;

        const auto& setups = config["setups"];
        assert(setups.is_array() && !setups.empty());

        // TODO: how to choose suitable setup if multiple are present
        for (const auto& s : setups)
        {
            result.id = s["id"].get<std::string>();
            result.simRtp = s["simRtp"].get<double>();
            result.minCap = s["minCap"].is_null() ? std::nullopt : std::make_optional(s["minCap"].get<int>());
            result.maxCap = s["maxCap"].is_null() ? std::nullopt : std::make_optional(s["maxCap"].get<int>());
            result.mathFileId = s["mathFileId"].get<std::string>();
            break;
        }

        return result;
    }
}
`,
    [`CMakeLists.txt`]: `# cmake-format: off
egt_create_static_library(
    LINK_LIBRARIES
        EgtAlphaFamilyStatic
)
# cmake-format: on
`,
    [`SimulatorConfig/MathDefs.data.h`]: `#pragma once

#include <Egt/Core/Data/Data.h>
#include <Egt/Core/Tools/Containers.h>

#include <string>
#include <vector>

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/// !!! Modifications should be made with caution.
/// !!! You can 'add', but NOT delete or rename.
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
namespace Egt::Simulators::MathData
{
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    struct SymbolsData
    {
        std::vector<std::string> symbolNames;
        int                      wildId = -1;
        std::vector<int>         scatterIds;
    };

    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Probabilities for zero round
    struct RtpReducer
    {
        std::vector<int> zeroRounds;     // for each bet
        int              perRounds = 0;  // zeroRounds/perRounds
    };

    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    using Paytable = Core::Vector<int, 2>;  // lines and scatter paytables
    using Lines    = Core::Vector<int, 2>;  // offsets

    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Classic reels distribution
    struct ReelsData
    {
        int                  probability = 100;  // weight
        Core::Vector<int, 2> intReels;           // symbolIds (all reels)
    };

    // set of reels
    using ReelsDistribution = std::vector<ReelsData>;

    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // JumboWay reels
    struct ReelStripJw
    {
        std::vector<int> symbolIds;
        int              weight   = 0;  // for this (reelIdx, position)
        int              position = 0;  // unlocked rows for this reelIdx
        int              reelIdx  = 0;
    };

    // all reels and positions
    using ReelsJw = std::vector<ReelStripJw>;

    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    struct Distribution
    {
        std::vector<int> elements;
        std::vector<int> weights;
    };

    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
`,
  };
}

export function MathRulesCpp({ game, simulatorName }: MathTemplateNames, createRules: string, priorities: string): string {
  return `#include "MathRules.h"

#include <Egt/${game}Math/${game}Math.h>
#include <Egt/${game}Math/SimulatorConfig/${simulatorName}.data.h>

#include <Egt/AlphaFamily/Math/HoldAndSpin/HoldAndSpinRoundRules.h>
#include <Egt/AlphaFamily/Math/Reel/ReelRoundRules.h>
#include <Egt/AlphaFamily/Math/Wheel/WheelRoundRules.h>

#include <Egt/Game/RuntimeExport/IResources.h>

#include <Egt/GameCore/Common/Defensive.h>
#include <Egt/GameCore/Log/LogCategory.h>

#include <Egt/Core/Plugin/ObjectFactory.h>

namespace Egt::Game::AlphaFamily
{
    namespace
    {
        EgtLogCategory(AutoLogCategory, "${game}Math.MathRules");
    }

    MathRules::MathRules(${game}Math& math)
        : m_math(math)
    {
    }

    MathRules::~MathRules() = default;

    void MathRules::Init(const MathRulesInitConfig& rulesConfig)
    {
        m_math.RuntimeAdd<IMathRules>(this);

        CreateRules(rulesConfig);
        CollectAvailableRoundTypes();
        CollectConsecutiveRoundTypePriorities();
    }

    void MathRules::Deinit()
    {
        m_math.RuntimeRemove<IMathRules>();
    }

    const std::vector<RoundType>& MathRules::GetAvailableRoundTypes() const
    {
        return m_availableRoundTypes;
    }

    const std::map<RoundType, int>& MathRules::GetConsecutiveRoundTypePriorities() const
    {
        return m_consecutiveRoundTypePriorities;
    }

    bool MathRules::HasReelRoundRules(RoundType roundType) const
    {
        auto it = m_reelRoundRules.find(roundType);
        ReturnUnless(it != m_reelRoundRules.end(), false);
        ReturnUnless(it->second, false);
        return true;
    }

    const ReelRoundRules& MathRules::GetReelRoundRules(RoundType roundType) const
    {
        auto it = m_reelRoundRules.find(roundType);
        if (it == m_reelRoundRules.end())
        {
            EgtAError("ReelRoundRules not found for roundType={}", (int)roundType);
            throw std::logic_error("ReelRoundRules not found!");
        }
        return *it->second;
    }

    bool MathRules::HasHoldAndSpinRules([[maybe_unused]] RoundType roundType) const
    {
        return false;
    }

    const HoldAndSpinRoundRules& MathRules::GetHoldAndSpinRoundRules(RoundType roundType) const
    {
        EgtAError("HoldAndSpinRoundRules not found for round = {}", (int)roundType);
        throw std::logic_error("HoldAndSpinRoundRules not found");

        static HoldAndSpinRoundRulesConfig dummyConfig;
        static HoldAndSpinRoundRules dummy(dummyConfig);
        return dummy;
    }

    bool MathRules::HasWheelRoundRules(RoundType roundType) const
    {
        auto it = m_wheelRoundRules.find(roundType);
        ReturnUnless(it != m_wheelRoundRules.end(), false);
        ReturnUnless(it->second, false);
        return true;
    }

    const WheelRoundRules& MathRules::GetWheelRoundRules(RoundType roundType) const
    {
        auto it = m_wheelRoundRules.find(roundType);
        if (it == m_wheelRoundRules.end())
        {
            EgtAError("Wheel::RoundRules not found for roundType={}", (int)roundType);
            throw std::logic_error("Wheel::RoundRules not found!");
        }
        return *it->second;
    }

${createRules}${priorities}    void MathRules::CollectAvailableRoundTypes()
    {
        m_availableRoundTypes.clear();

        for (auto& roundType : m_reelRoundRules | std::views::keys)
        {
            m_availableRoundTypes.push_back(roundType);
        }

        for (auto& roundType : m_wheelRoundRules | std::views::keys)
        {
            m_availableRoundTypes.push_back(roundType);
        }
    }
}
`;
}

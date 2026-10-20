#include "TetraRoundInput.h"

#include <Egt/AlphaFamilyStatesLibrary/Match/TetraRound/TetraRound.data.h>

#include <Egt/AlphaFamily/Math/Reel/ReelRoundRules.h>
#include <Egt/AlphaFamily/RuntimeImport/IGameflow.bridge.h>
#include <Egt/AlphaFamily/States/IBetManager.h>
#include <Egt/AlphaFamily/States/IGameManager.h>
#include <Egt/AlphaFamily/States/ISystemManager.h>
#include <Egt/AlphaFamily/States/IViewManager.h>
#include <Egt/AlphaFamily/Views/SwButtonViews.bridge.h>

#include <Egt/Game/RuntimeImport/HwButtons.bridge.h>

#include <Egt/GameCore/Common/Defensive.h>

namespace Egt::Game::AlphaFamily
{
    using namespace States;
    using Reaction = Fsm::State::Reaction;

    EgtALogCategoryClass(TetraRoundInputState, "TetraRoundInputState");

    void TetraRoundInputState::OnTransit(bool isStartup, bool isRecovery)
    {
        EgtATrace(
            "OnTransit {} {} {}",
            Parent<ITetraRound>().GetRoundType(),
            isStartup ? "isStartup" : "",
            isRecovery ? "isRecovery" : "");
        (void)isStartup;
        (void)isRecovery;

        AttachCallbacks();

        RefreshViews(isStartup);

        if (Parent<IGameManager>().IsAutoPlayOn())
        {
            RuntimeGet<IStartHwButton>().SimulateButtonPress();
        }
    }

    void TetraRoundInputState::AttachCallbacks()
    {
        ReactOn(
            RuntimeGetConst<Game::IStartHwButton::Events>().buttonPressedEvent,
            &TetraRoundInputState::OnStartHwButtonPressed);
        ReactOn(
            RuntimeGetConst<IAutoPlayHwButton::Events>().buttonPressedEvent,
            &TetraRoundInputState::OnAutoPlayHwButtonPressed);

        ReactOn(Parent<IBetManager::Events>().betChanged, &TetraRoundInputState::OnBetChanged);
        ReactOn(
            RuntimeGetConst<ICashoutHwButton::Events>().buttonPressedEvent,
            &TetraRoundInputState::OnCashoutButtonPressed);

        if (auto collectTetraButtonEvents = RuntimeTryGetConst<IExitTetraSwButtonView::Events>())
        {
            ReactOn(collectTetraButtonEvents->buttonPressedEvent, &TetraRoundInputState::OnCollectTetraButtonPressed);
        }
    }

    Reaction TetraRoundInputState::ToRoundStarting()
    {
        return Transit<ITetraRoundStarting>();
    }

    void TetraRoundInputState::RefreshViews(bool autoSelectInfoPage)
    {
        Parent<ITetraRound>().SetupViews({
            .autoSelectInfoPage = autoSelectInfoPage,
            .enableButtons = true,
            .enableInput = true,
        });
    }

    void TetraRoundInputState::SetupBetInput()
    {
        const auto& betManager = Parent<IBetManager>();
        const auto& rules = Parent<ITetraRound>().GetRoundRules();
        const auto subscreens = rules.GetTetraSpinRules().GetSubScreenCount();
        const auto currentBet = betManager.GetCurrentBet();

        auto& storage = Nvram<TetraRoundStorage>();
        assert(storage.roundInput);
        auto& input = storage.roundInput.value();

        input.bet = currentBet;
        input.lines = betManager.GetCurrentLines();
        input.betPerLine = input.bet / (subscreens * input.lines);
        input.consume = Currencies(Currency::Credits, currentBet);
    }

    Reaction TetraRoundInputState::OnStartHwButtonPressed()
    {
        SetupBetInput();

        return ToRoundStarting();
    }

    Reaction TetraRoundInputState::OnAutoPlayHwButtonPressed()
    {
        ReturnIf(Parent<IGameManager>().IsAutoPlayOn(), Skip());

        Parent<IGameManager>().SetAutoPlay(true);
        RuntimeGet<IStartHwButton>().SimulateButtonPress();
        return Consume();
    }

    Reaction TetraRoundInputState::OnBetChanged([[maybe_unused]] int64_t bet)
    {
        auto& betManager = Parent<IBetManager>();
        betManager.SetInitialBetFromCurrent();

        RefreshViews(true);

        return Forward();
    }

    Reaction TetraRoundInputState::OnCashoutButtonPressed()
    {
        Parent<ISystemManager>().RequestPendingCashout();
        // At the input there is no round to present: the last one has ended, or none has started. Presenting it went on
        // to TetraRoundEnding, which requested the end of a round that does not exist (IGameflow::RequestEndRound
        // throws). Like the exit tetra button, Cashout ends the tetra rounds.
        return Transit<ITetraRoundOutro>();
    }

    Reaction TetraRoundInputState::OnCollectTetraButtonPressed()
    {
        return Transit<ITetraRoundOutro>();
    }
}

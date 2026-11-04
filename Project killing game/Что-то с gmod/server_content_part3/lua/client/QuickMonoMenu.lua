local quickMenuWindow = nil
hook.Add("PlayerButtonDown", "QuickMenu", function (ply, button)
    if button == 17 and quickMenuWindow == nil then
        if ply:IsSuperAdmin() then
            quickMenuWindow = vgui.Create("DFrame")
            quickMenuWindow:SetSize(ScrW()/1.5,ScrH()/1.5)
            quickMenuWindow:Center()
            quickMenuWindow:MakePopup()
            quickMenuWindow:ShowCloseButton(false)
            quickMenuWindow:SetTitle("")

            quickMenuWindow.Paint = function(self,w,h)
                draw.RoundedBox( 8, 0, 0, w, h, Color( 80, 80, 80 ) )
            end

            function quickMenuWindow:OnRemove()
                quickMenuWindow = nil 
            end

            local buttonClose = quickMenuWindow:Add("DButton")
            buttonClose:SetPos(quickMenuWindow:GetWide()-buttonClose:GetWide(),buttonClose:GetY())
            buttonClose:SetText("Закрыть")
            buttonClose.DoClick = function()
                quickMenuWindow:Remove()
            end

            local panelPlayers = quickMenuWindow:Add("DPanel")
            panelPlayers:SetSize(quickMenuWindow:GetWide()/2,quickMenuWindow:GetTall())
            panelPlayers:SetPos(quickMenuWindow:GetWide()/4,0)

            local scrollPlayers = panelPlayers:Add("DScrollPanel")
            scrollPlayers:SetSize(panelPlayers:GetSize())

            local posCheckBoxPlayer = scrollPlayers:GetY()
            local checkBoxesPlayers = {}
            local labelsPlayers = {}
            local labelsPly = {}

            for i, value in ipairs(player.GetAll()) do
                local DCheckBoxPlayer = scrollPlayers:Add("DCheckBox")
                DCheckBoxPlayer:SetChecked(false)
                DCheckBoxPlayer:SetPos(scrollPlayers:GetX(),posCheckBoxPlayer)

                checkBoxesPlayers[i] = DCheckBoxPlayer

                local DLabelCheck = scrollPlayers:Add("DLabel")
                steamworks.RequestPlayerInfo( value:SteamID64(), function( steamName )
                    if (value:GetMoveType() == MOVETYPE_NOCLIP) then
                        DLabelCheck:SetText(value:Nick() .." " .. steamName .. " " .. value:GetUserGroup() .. " Noclip", value:SteamID())
                    else
                        DLabelCheck:SetText(value:Nick() .." " .. steamName .. " " .. value:GetUserGroup(), value:SteamID())
                    end
                    DLabelCheck:SetTextColor(Color(0,0,0))
                    labelsPlayers[i] = value
                end )
                DLabelCheck:SetPos(DCheckBoxPlayer:GetX()+DCheckBoxPlayer:GetWide()*1.5,posCheckBoxPlayer)
                DLabelCheck:SetSize(scrollPlayers:GetWide(),DCheckBoxPlayer:GetTall())
                labelsPly[i] = DLabelCheck
                posCheckBoxPlayer = posCheckBoxPlayer + DCheckBoxPlayer:GetTall()*1.2
            end

            --Выделение групп игроков--

            local scrollRoles = quickMenuWindow:Add("DScrollPanel")
            scrollRoles:SetSize(quickMenuWindow:GetWide()-(panelPlayers:GetWide()+panelPlayers:GetX()),quickMenuWindow:GetTall()/2.5)
            scrollRoles:SetPos(panelPlayers:GetWide()+panelPlayers:GetX(),quickMenuWindow:GetTall()-scrollRoles:GetTall())

            local buttonAll = scrollRoles:Add("DButton")
            buttonAll:SetSize(scrollRoles:GetWide(),buttonAll:GetTall())
            buttonAll:SetText("All")
            buttonAll.DoClick = function()
                for i,val in ipairs(checkBoxesPlayers) do
                    val:SetChecked(true)
                end
            end

            local buttonAdminsAndPlayers = scrollRoles:Add("DButton")
            buttonAdminsAndPlayers:SetSize(scrollRoles:GetWide(),buttonAdminsAndPlayers:GetTall())
            buttonAdminsAndPlayers:SetText("AdminsAndPlayers")
            buttonAdminsAndPlayers:SetPos(0,buttonAll:GetY()+buttonAll:GetTall())
            buttonAdminsAndPlayers.DoClick = function()
                for i,val in ipairs(checkBoxesPlayers) do
                    val:SetChecked(false)
                    if (!labelsPlayers[i]:IsSuperAdmin()) then
                        val:SetChecked(true)
                    end
                end
            end

            local buttonAdmins = scrollRoles:Add("DButton")
            buttonAdmins:SetSize(scrollRoles:GetWide(),buttonAdmins:GetTall())
            buttonAdmins:SetText("Admins")
            buttonAdmins:SetPos(0,buttonAdminsAndPlayers:GetY()+buttonAdminsAndPlayers:GetTall())
            buttonAdmins.DoClick = function()
                for i,val in ipairs(checkBoxesPlayers) do
                    val:SetChecked(false)
                    if (labelsPlayers[i]:IsAdmin() and !labelsPlayers[i]:IsSuperAdmin()) then
                        val:SetChecked(true)
                    end
                end
            end

            local buttonPlayers = scrollRoles:Add("DButton")
            buttonPlayers:SetSize(scrollRoles:GetWide(),buttonPlayers:GetTall())
            buttonPlayers:SetText("Players")
            buttonPlayers:SetPos(0,buttonAdmins:GetY()+buttonAdmins:GetTall())
            buttonPlayers.DoClick = function()
                for i,val in ipairs(checkBoxesPlayers) do
                    val:SetChecked(false)
                    if (!labelsPlayers[i]:IsSuperAdmin() and !labelsPlayers[i]:IsAdmin()) then
                        val:SetChecked(true)
                    end
                end
            end

            --Конец блока--


            --Панель с настройкой команд--

            local panelExecution = quickMenuWindow:Add("DPanel")
            panelExecution:SetSize(buttonPlayers:GetWide(),buttonClose:GetY()+scrollRoles:GetTall())
            panelExecution:SetPos(scrollRoles:GetX(),buttonClose:GetY()+buttonClose:GetTall()+buttonClose:GetTall())

            --Конец блока--


            --Кнопки команд--

            local scrollButtons = quickMenuWindow:Add("DScrollPanel")
            scrollButtons:SetSize(panelPlayers:GetX(),quickMenuWindow:GetTall())

            local buttonCsay = scrollButtons:Add("DButton")
            buttonCsay:SetSize(scrollButtons:GetWide(),buttonCsay:GetTall())
            buttonCsay:SetText("Csay")
            buttonCsay.DoClick = function()
                for i,v in ipairs(panelExecution:GetChildren()) do
                    v:Remove()
                end

                local csayText = panelExecution:Add("DTextEntry")
                csayText:SetSize(panelExecution:GetWide(),csayText:GetTall())

                local buttonExe =  panelExecution:Add("DButton")
                buttonExe:SetSize(panelExecution:GetWide(),buttonExe:GetTall())
                buttonExe:SetPos(0, 0+csayText:GetTall()*2)
                buttonExe:SetText("Csay")
                buttonExe.DoClick = function()
                    local tablePlayersStats = {}
                    local countPlayersStats = 1
                    for i,val in ipairs(checkBoxesPlayers) do
                        if val:GetChecked()==true then
                            tablePlayersStats[countPlayersStats] = labelsPlayers[i]
                            countPlayersStats=countPlayersStats+1
                        end
                    end
                    net.Start("CsayServer")
                    net.WriteString(csayText:GetText())
                    net.WriteTable(tablePlayersStats)
                    net.SendToServer()
                end
            end

            local buttonNotifications = scrollButtons:Add("DButton")
            buttonNotifications:SetSize(scrollButtons:GetWide(),buttonNotifications:GetTall())
            buttonNotifications:SetText("Notifications")
            buttonNotifications:SetPos(0,buttonCsay:GetTall())
            buttonNotifications.DoClick = function()
                for i,v in ipairs(panelExecution:GetChildren()) do
                    v:Remove()
                end

                local notificationsText = panelExecution:Add("DTextEntry")
                notificationsText:SetSize(panelExecution:GetWide(),notificationsText:GetTall())

                local typeComboBox = panelExecution:Add("DComboBox")
                typeComboBox:SetSize(notificationsText:GetSize())
                typeComboBox:SetPos(0, 0+notificationsText:GetTall())
                typeComboBox:SetSortItems(false)
                typeComboBox:SetValue("Выберите")
                typeComboBox:AddChoice( "Generic" )
                typeComboBox:AddChoice( "Error" )
                typeComboBox:AddChoice( "Undo" )
                typeComboBox:AddChoice( "Hint" )
                typeComboBox:AddChoice( "CleanUp" )
                typeComboBox:AddChoice( "Progress" )

                local timeNotify = panelExecution:Add("DTextEntry")
                timeNotify:SetSize(notificationsText:GetSize())
                timeNotify:SetPos(0, 0+notificationsText:GetTall()*2)
                timeNotify:SetNumeric(true)
                timeNotify:SetValue("5")

                local buttonExe =  panelExecution:Add("DButton")
                buttonExe:SetSize(panelExecution:GetWide(),buttonExe:GetTall())
                buttonExe:SetPos(0, 0+notificationsText:GetTall()*3)
                buttonExe:SetText("Notifications")
                buttonExe.DoClick = function()
                    local tablePlayersStats = {}
                    local countPlayersStats = 1
                    for i,val in ipairs(checkBoxesPlayers) do
                        if val:GetChecked()==true then
                            tablePlayersStats[countPlayersStats] = labelsPlayers[i]
                            countPlayersStats=countPlayersStats+1
                        end
                    end
                    net.Start("NotificationServer")
                    net.WriteString(notificationsText:GetText())
                    net.WriteInt(tonumber(typeComboBox:GetSelectedID(),10),6)
                    net.WriteTable(tablePlayersStats)
                    net.WriteUInt( tonumber(timeNotify:GetValue()), 32 )
                    net.SendToServer()
                end
            end

            local buttonBlind = scrollButtons:Add("DButton")
            buttonBlind:SetSize(scrollButtons:GetWide(),buttonBlind:GetTall())
            buttonBlind:SetText("Blind")
            buttonBlind:SetPos(0,buttonNotifications:GetY()+buttonNotifications:GetTall())
            buttonBlind.DoClick = function()
                for i,v in ipairs(panelExecution:GetChildren()) do
                    v:Remove()
                end

                local buttonExe =  panelExecution:Add("DButton")
                buttonExe:SetSize(panelExecution:GetWide(),buttonExe:GetTall())
                buttonExe:SetText("Blind")
                buttonExe.DoClick = function()
                    local tablePlayersStats = {}
                    local countPlayersStats = 1
                    for i,val in ipairs(checkBoxesPlayers) do
                        if val:GetChecked()==true then
                            tablePlayersStats[countPlayersStats] = labelsPlayers[i]
                            countPlayersStats=countPlayersStats+1
                        end
                    end
                    net.Start("BlindServer")
                    net.WriteInt(1,3)
                    net.WriteTable(tablePlayersStats)
                    net.SendToServer()
                end

                local buttonUnBlind =  panelExecution:Add("DButton")
                buttonUnBlind:SetSize(panelExecution:GetWide(),buttonUnBlind:GetTall())
                buttonUnBlind:SetText("UnBlind")
                buttonUnBlind:SetPos(0,0+buttonExe:GetTall())
                buttonUnBlind.DoClick = function()
                    local tablePlayersStats = {}
                    local countPlayersStats = 1
                    for i,val in ipairs(checkBoxesPlayers) do
                        if val:GetChecked()==true then
                            tablePlayersStats[countPlayersStats] = labelsPlayers[i]
                            countPlayersStats=countPlayersStats+1
                        end
                    end
                    net.Start("BlindServer")
                    net.WriteInt(2,3)
                    net.WriteTable(tablePlayersStats)
                    net.SendToServer()
                end
            end


            local buttonSlay = scrollButtons:Add("DButton")
            buttonSlay:SetSize(scrollButtons:GetWide(),buttonSlay:GetTall())
            buttonSlay:SetText("Slay")
            buttonSlay:SetPos(0,buttonBlind:GetY()+buttonBlind:GetTall())
            buttonSlay.DoClick = function()
                for i,v in ipairs(panelExecution:GetChildren()) do
                    v:Remove()
                end

                local buttonExe =  panelExecution:Add("DButton")
                buttonExe:SetSize(panelExecution:GetWide(),buttonExe:GetTall())
                buttonExe:SetText("Slay")
                buttonExe.DoClick = function()
                    local tablePlayersStats = {}
                    local countPlayersStats = 1
                    for i,val in ipairs(checkBoxesPlayers) do
                        if val:GetChecked()==true then
                            tablePlayersStats[countPlayersStats] = labelsPlayers[i]
                            countPlayersStats=countPlayersStats+1
                        end
                    end
                    net.Start("SlayServer")
                    net.WriteTable(tablePlayersStats)
                    net.SendToServer()
                end
            end

            local buttonStrip = scrollButtons:Add("DButton")
            buttonStrip:SetSize(scrollButtons:GetWide(),buttonStrip:GetTall())
            buttonStrip:SetText("Strip")
            buttonStrip:SetPos(0,buttonSlay:GetY()+buttonSlay:GetTall())
            buttonStrip.DoClick = function()
                for i,v in ipairs(panelExecution:GetChildren()) do
                    v:Remove()
                end

                local buttonExe =  panelExecution:Add("DButton")
                buttonExe:SetSize(panelExecution:GetWide(),buttonExe:GetTall())
                buttonExe:SetText("Strip")
                buttonExe.DoClick = function()
                    local tablePlayersStats = {}
                    local countPlayersStats = 1
                    for i,val in ipairs(checkBoxesPlayers) do
                        if val:GetChecked()==true then
                            tablePlayersStats[countPlayersStats] = labelsPlayers[i]
                            countPlayersStats=countPlayersStats+1
                        end
                    end
                    net.Start("StripServer")
                    net.WriteTable(tablePlayersStats)
                    net.SendToServer()
                end
            end

            local buttonSetName = scrollButtons:Add("DButton")
            buttonSetName:SetSize(scrollButtons:GetWide(),buttonSetName:GetTall())
            buttonSetName:SetText("SetName")
            buttonSetName:SetPos(0,buttonStrip:GetY()+buttonStrip:GetTall())
            buttonSetName.DoClick = function()
                for i,v in ipairs(panelExecution:GetChildren()) do
                    v:Remove()
                end

                local newNameText = panelExecution:Add("DTextEntry")
                newNameText:SetSize(panelExecution:GetWide(),newNameText:GetTall())

                local buttonExe =  panelExecution:Add("DButton")
                buttonExe:SetSize(panelExecution:GetWide(),buttonExe:GetTall())
                buttonExe:SetPos(0, 0+newNameText:GetTall()*2)
                buttonExe:SetText("SetName")
                buttonExe.DoClick = function()
                    local tablePlayersStats = {}
                    local countPlayersStats = 1
                    for i,val in ipairs(checkBoxesPlayers) do
                        if val:GetChecked()==true then
                            tablePlayersStats[countPlayersStats] = labelsPlayers[i]
                            countPlayersStats=countPlayersStats+1
                        end
                    end
                    net.Start("SetNameServer")
                    net.WriteString(newNameText:GetText())
                    net.WriteTable(tablePlayersStats)
                    net.SendToServer()
                end
            end

            local buttonBring = scrollButtons:Add("DButton")
            buttonBring:SetSize(scrollButtons:GetWide(),buttonBring:GetTall())
            buttonBring:SetText("Bring")
            buttonBring:SetPos(0,buttonSetName:GetY()+buttonSetName:GetTall())
            buttonBring.DoClick = function()
                for i,v in ipairs(panelExecution:GetChildren()) do
                    v:Remove()
                end

                local buttonExe =  panelExecution:Add("DButton")
                buttonExe:SetSize(panelExecution:GetWide(),buttonExe:GetTall())
                buttonExe:SetText("Bring")
                buttonExe.DoClick = function()
                    local tablePlayersStats = {}
                    local countPlayersStats = 1
                    for i,val in ipairs(checkBoxesPlayers) do
                        if val:GetChecked()==true then
                            tablePlayersStats[countPlayersStats] = labelsPlayers[i]
                            countPlayersStats=countPlayersStats+1
                        end
                    end
                    net.Start("BringServer")
                    net.WriteTable(tablePlayersStats)
                    net.SendToServer()
                end
            end

            local buttonNoclip = scrollButtons:Add("DButton")
            buttonNoclip:SetSize(scrollButtons:GetWide(),buttonNoclip:GetTall())
            buttonNoclip:SetText("Noclip")
            buttonNoclip:SetPos(0,buttonBring:GetY()+buttonBring:GetTall())
            buttonNoclip.DoClick = function()
                for i,v in ipairs(panelExecution:GetChildren()) do
                    v:Remove()
                end

                local buttonExe =  panelExecution:Add("DButton")
                buttonExe:SetSize(panelExecution:GetWide(),buttonExe:GetTall())
                buttonExe:SetText("Noclip")
                buttonExe.DoClick = function()
                    local tablePlayersStats = {}
                    local countPlayersStats = 1
                    for i,val in ipairs(checkBoxesPlayers) do
                        if val:GetChecked()==true then
                            tablePlayersStats[countPlayersStats] = labelsPlayers[i]
                            countPlayersStats=countPlayersStats+1
                        end
                    end
                    net.Start("NoclipServer")
                    net.WriteTable(tablePlayersStats)
                    net.SendToServer()
                    timer.Simple(0.2, function()
                        scrollPlayers:Clear()
                        posCheckBoxPlayer = scrollPlayers:GetY()
                        for i, value in ipairs(player.GetAll()) do
                            local DCheckBoxPlayer = scrollPlayers:Add("DCheckBox")
                            DCheckBoxPlayer:SetChecked(false)
                            DCheckBoxPlayer:SetPos(scrollPlayers:GetX(),posCheckBoxPlayer)

                            checkBoxesPlayers[i] = DCheckBoxPlayer

                            local DLabelCheck = scrollPlayers:Add("DLabel")
                            steamworks.RequestPlayerInfo( value:SteamID64(), function( steamName )
                                if (value:GetMoveType() == MOVETYPE_NOCLIP) then
                                    DLabelCheck:SetText(value:Nick() .." " .. steamName .. " " .. value:GetUserGroup() .. " Noclip", value:SteamID())
                                else
                                    DLabelCheck:SetText(value:Nick() .." " .. steamName .. " " .. value:GetUserGroup(), value:SteamID())
                                end
                                DLabelCheck:SetTextColor(Color(0,0,0))
                                labelsPlayers[i] = value
                            end )
                            DLabelCheck:SetPos(DCheckBoxPlayer:GetX()+DCheckBoxPlayer:GetWide()*1.5,posCheckBoxPlayer)
                            DLabelCheck:SetSize(scrollPlayers:GetWide(),DCheckBoxPlayer:GetTall())
                            posCheckBoxPlayer = posCheckBoxPlayer + DCheckBoxPlayer:GetTall()*1.2
                        end
                    end)
                end
            end

            local buttonUserGroup = scrollButtons:Add("DButton")
            buttonUserGroup:SetSize(scrollButtons:GetWide(),buttonNoclip:GetTall())
            buttonUserGroup:SetText("UserGroup")
            buttonUserGroup:SetPos(0,buttonNoclip:GetY()+buttonNoclip:GetTall())
            buttonUserGroup.DoClick = function()
                for i,v in ipairs(panelExecution:GetChildren()) do
                    v:Remove()
                end

                local groupComboBox = panelExecution:Add("DComboBox")
                groupComboBox:SetSize(panelExecution:GetWide(),groupComboBox:GetTall())
                groupComboBox:SetSortItems(false)
                groupComboBox:SetValue("Выберите")
                groupComboBox:AddChoice( "superadmin" )
                groupComboBox:AddChoice( "admin" )
                groupComboBox:AddChoice( "player" )
                groupComboBox:AddChoice( "spectator" )

                local buttonExe =  panelExecution:Add("DButton")
                buttonExe:SetSize(panelExecution:GetWide(),buttonExe:GetTall())
                buttonExe:SetPos(0,0+groupComboBox:GetTall())
                buttonExe:SetText("UserGroup")
                buttonExe.DoClick = function()
                    local tablePlayersStats = {}
                    local countPlayersStats = 1
                    for i,val in ipairs(checkBoxesPlayers) do
                        if val:GetChecked()==true then
                            tablePlayersStats[countPlayersStats] = labelsPlayers[i]
                            countPlayersStats=countPlayersStats+1
                        end
                    end
                    net.Start("UserGroupServer")
                    net.WriteString(groupComboBox:GetOptionText(groupComboBox:GetSelectedID()))
                    print(groupComboBox:GetOptionText(groupComboBox:GetSelectedID()))
                    net.WriteTable(tablePlayersStats)
                    net.SendToServer()
                    timer.Simple(0.2, function()
                        scrollPlayers:Clear()
                        posCheckBoxPlayer = scrollPlayers:GetY()
                        for i, value in ipairs(player.GetAll()) do
                            local DCheckBoxPlayer = scrollPlayers:Add("DCheckBox")
                            DCheckBoxPlayer:SetChecked(false)
                            DCheckBoxPlayer:SetPos(scrollPlayers:GetX(),posCheckBoxPlayer)

                            checkBoxesPlayers[i] = DCheckBoxPlayer

                            local DLabelCheck = scrollPlayers:Add("DLabel")
                            steamworks.RequestPlayerInfo( value:SteamID64(), function( steamName )
                                if (value:GetMoveType() == MOVETYPE_NOCLIP) then
                                    DLabelCheck:SetText(value:Nick() .." " .. steamName .. " " .. value:GetUserGroup() .. " Noclip", value:SteamID())
                                else
                                    DLabelCheck:SetText(value:Nick() .." " .. steamName .. " " .. value:GetUserGroup(), value:SteamID())
                                end
                                DLabelCheck:SetTextColor(Color(0,0,0))
                                labelsPlayers[i] = value
                            end )
                            DLabelCheck:SetPos(DCheckBoxPlayer:GetX()+DCheckBoxPlayer:GetWide()*1.5,posCheckBoxPlayer)
                            DLabelCheck:SetSize(scrollPlayers:GetWide(),DCheckBoxPlayer:GetTall())
                            posCheckBoxPlayer = posCheckBoxPlayer + DCheckBoxPlayer:GetTall()*1.2
                        end
                    end)
                end
            end
        end
    end
    -- Конец блока --
end)

--Csay--
   net.Receive("CsayClient",function()
        local color = Color( 255, 255, 255, 255 )
        local duration = 5
        local fade = 0.5
        local start = CurTime()
        local msg = net.ReadString()

        local function drawToScreen()
            local alpha = 255
            local dtime = CurTime() - start

            if dtime > duration then -- Our time has come :'(
                hook.Remove( "HUDPaint", "CSayHelperDraw" )
                return
            end

            if fade - dtime > 0 then -- beginning fade
                alpha = (fade - dtime) / fade -- 0 to 1
                alpha = 1 - alpha -- Reverse
                alpha = alpha * 255
            end

            if duration - dtime < fade then -- ending fade
                alpha = (duration - dtime) / fade -- 0 to 1
                alpha = alpha * 255
            end
            color.a  = alpha

            draw.DrawText( msg, "TargetID", ScrW() * 0.5, ScrH() * 0.25, color, TEXT_ALIGN_CENTER )
        end

        hook.Add( "HUDPaint", "CSayHelperDraw", drawToScreen )
   end) 
----

--Notifications--
   net.Receive("NotificationClient",function()
        local msg = net.ReadString()
        local idNotify = net.ReadInt(6)-1
        local timeNotify = net.ReadUInt(32)
        if (idNotify < 5) then
            notification.AddLegacy( msg, idNotify, timeNotify )
        else
            notification.AddProgress("NotifyPly", msg)
            timer.Simple(timeNotify, function()
                notification.Kill("NotifyPly")
            end)
        end
   end) 
----

--Blind--
   net.Receive("BlindClient",function()
        LocalPlayer():ScreenFade( SCREENFADE.OUT, Color( 255,255,255, 255 ), 2.1, 0 )
        LocalPlayer():ScreenFade( SCREENFADE.STAYOUT, Color( 255,255,255, 255 ),5000,0)
   end) 
----

--UnBlind--
   net.Receive("UnBlindClient",function()
        LocalPlayer():ScreenFade( SCREENFADE.PURGE, Color( 255,255,255, 0 ),1,0)
        LocalPlayer():ScreenFade( SCREENFADE.IN, Color( 255,255,255, 255 ), 0.5, 0 )
   end) 
----

print("QuickMonomenu saved")
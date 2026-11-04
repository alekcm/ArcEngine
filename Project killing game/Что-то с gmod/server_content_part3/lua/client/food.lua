local ent = nil
local Time = 0
local GlobalTime = 0
local GlobalNumberOfSprite = 0
local Globalserversend = nil
local Globalent = nil
local GlobalLenght = 0
local closeButtonFoodMachine = nil
local Search = 0
local movingImage = nil
local rnd = 0
local i = 0
local SearchScaler = 3
local PlayerObservation = 10


local HunglyMultiple = 30 
local ThirstyMultiple = 20
local SleepMultiple = 45
local SoberMultiple = 10
local SoberDrinkMultiple = 1
local CanBeHungry = false
local CanBeThirsty = true
local CanBeSleepy = true
local food = 100
local water = 100
sleep = 100
local alcohol = 0
local sawfeelings = true
local Isleepnow = false

--не даёт открывать холодильник пока ищешь еду--
local foodSearch = false

local lockFood = 0

local function StartWaiting(GlobalTime, startlenght, GlobalLenght1)
    local function NextPart()
        local scaler = 1

        if movingImage ~= nil then
            if movingImage:GetX() >= ScrW()/2+rnd+GlobalLenght/4 - GlobalLenght/64-PlayerObservation and movingImage:GetX() <= ScrW()/2+rnd+GlobalLenght/4 + GlobalLenght/64 then
                scaler = 4
                elseif movingImage:GetX() >= ScrW()/2+rnd+GlobalLenght/4 - GlobalLenght/8-PlayerObservation and movingImage:GetX() <= ScrW()/2+rnd+GlobalLenght/4 + GlobalLenght/8 then
                scaler = 2
                elseif movingImage:GetX() >= ScrW()/2+rnd-PlayerObservation and movingImage:GetX() <= ScrW()/2+rnd+GlobalLenght/2 then
                scaler = 1
            else
                scaler = 0
            end
        end

        if GlobalLenght < startlenght/GlobalTime*(scaler+1) and scaler ~= 0 then
            scaler = scaler + 3
        end

            if (LocalPlayer():Name() == "Кируми Тоджо" or LocalPlayer():Name() == "Терутеру Ханамура") then
                scaler = scaler * 3
            end

            GlobalLenght = GlobalLenght - (startlenght/GlobalTime)*scaler
            
                --Time = Time - 1
                if (Time <= 0 and Globalent ~= nil) or (GlobalLenght <0 and Globalent ~= nil) then
                    --net.Start("SearchFood2")
                    --net.SendToServer()
                    closeButtonFoodMachine:Close()
                    movingImage = nil
                    if(Search == 0) then
                        foodSearch = false
                        net.Start(Globalserversend)
                        net.WriteFloat(GlobalNumberOfSprite)
                        net.WriteEntity(Globalent)
                        net.SendToServer()
                    end
                    Globalent = nil
                    end
                    StartWaiting(GlobalTime, startlenght,GlobalLenght)
                end
    if closeButtonFoodMachine == nil then
        closeButtonFoodMachine = vgui.Create( "DFrame" )
        closeButtonFoodMachine:SetSize( ScrW(), ScrH())
        --closeButtonFoodMachine:SetPos(ScrW()/2-70, ScrH()/2+80)
        closeButtonFoodMachine.Paint = function (self,w,h)
        end
        function closeButtonFoodMachine:OnRemove()
            closeButtonFoodMachine = nil 
        end
        closeButtonFoodMachine:MakePopup()
        closeButtonFoodMachine:SetKeyboardInputEnabled( false )
        closeButtonFoodMachine:SetTitle("")
        closeButtonFoodMachine:ShowCloseButton(false)
        closeButtonFoodMachine:SetScreenLock(false)
        closeButtonFoodMachine:SetDraggable(false)
        local buttonCloseFoodMachine = vgui.Create("DButton",closeButtonFoodMachine)
        buttonCloseFoodMachine:SetText("X")
        buttonCloseFoodMachine:SetSize( 50, 50)
        buttonCloseFoodMachine:SetPos(ScrW()- 50, 0)
        buttonCloseFoodMachine.DoClick = function()
                --net.Start("SearchFood2")
                --net.SendToServer()
                GlobalLenght = -15
                Search = 1
                foodSearch = false
                NextPart()
            end
        local reactionButtonFoodMachine = vgui.Create("DButton",closeButtonFoodMachine)
        reactionButtonFoodMachine:SetText("Искать")
        reactionButtonFoodMachine:SetSize( ScrW()/12, ScrH()/18)
        reactionButtonFoodMachine:SetPos(ScrW()/2-70, ScrH()/2+80)
        reactionButtonFoodMachine.DoClick = function()
            NextPart()
            end
        end

        
    if GlobalLenght >0 then
        rnd = math.random(-200,200-GlobalLenght/2)
        if movingImage == nil then
        movingImage = vgui.Create("DButton",closeButtonFoodMachine)
        movingImage:SetSize(PlayerObservation,50)
        movingImage:SetText("")
        movingImage:SetPos(ScrW()/2-GlobalLenght/2, ScrH()/2-14)
        end
        
        hook.Add("HUDPaint", "Names3", function()
                if (LocalPlayer():GetPos():Distance(ent:GetPos()) > 120) then
                    foodSearch = false
                    GlobalLenght = -15
                    Search = 1
                    NextPart()
                end

                draw.SimpleText("Идёт поиск", "Trebuchet24", ScrW()/2, ScrH()/2-25, Color( 255, 255, 255, 255), TEXT_ALIGN_CENTER, TEXT_ALIGN_TOP)
                surface.SetDrawColor(Color(255,255,255,50))
                surface.DrawRect(ScrW()/2-400/2,ScrH()/2+20,400,22)

                surface.SetDrawColor(Color(255,255,255,255))
                surface.DrawRect(ScrW()/2+rnd,ScrH()/2+20,GlobalLenght/2,22)

                surface.SetDrawColor(Color(255,248,187,255))
               -- surface.DrawRect(ScrW()/2+rnd+GlobalLenght/4,ScrH()/2,GlobalLenght/8,22)
                surface.DrawRect(ScrW()/2+rnd+GlobalLenght/4- GlobalLenght/8,ScrH()/2+20,GlobalLenght/4,22)
                surface.SetDrawColor(Color(255,188,82,255))
                surface.DrawRect(ScrW()/2+rnd+GlobalLenght/4 - GlobalLenght/64,ScrH()/2+20,GlobalLenght/32,22)
                print(PlayerObservation)
                if i >= 400 - PlayerObservation/2 then
                    SearchScaler = -3
                    elseif i <= - PlayerObservation/2 then
                        SearchScaler = 3
                end

                --if i < 400 then
                i = i + SearchScaler
            --else
            --    i = 0
            --end
            if movingImage ~= nil then
                movingImage:SetPos(ScrW()/2-400/2+i, ScrH()/2-14+20)
            end
        end)
    end
    if GlobalLenght < startlenght/GlobalLenght or GlobalLenght <= 0 then
        hook.Add("HUDPaint", "Names3", function()
            draw.SimpleText(" ", "Trebuchet24", ScrW()/2, ScrH()/2-25, Color( 255, 255, 255, 255), TEXT_ALIGN_CENTER, TEXT_ALIGN_TOP)
        end)
    end
    if foodSearch == false then
        lockFood = 0
    end
end

local foodlist = {
        {"apple","Яблоко",5},
        {"toast","Тост",2},
        {"egg","Яйцо",3},
        {"juice","Сок",7},
        {"beer", "Пиво",7},
        {"donut","Пончик",3},
        {"bread","Батон",5},
        {"fish","Рыба",10},
        {"colla","Большая колла",15},
        {"pizza","Замороженная пицца",18},
        {"beacon","Бекон",4},
        {"potato","Картофель",5},
        {"pepsi","Маленькая пепси",10},
        {"watermelon","Арбуз",15},
        {"sandwitch","Сендвич",10},
        {"wrap","Замороженная шаурма",15},
        {"turkey","Замороженная индейка",22},
        {"energydrink","Энергетик",10}, 
        {"wine","Вино",20}, 
        {"rome","Ром",22}
}
local waterlist = {
        {"coffee","Кофе",5},
        {"tea","Чай",7},
        {"water", "Вода",7}
}
local vendinglist = {
        {"beer","300",1},
        {"colla","250",1},
        {"pepsi", "100",1},
        {"sandwitch", "150",1},
        {"energydrink", "100",1}
}
local function OpenFoodList(list, serversend, listlenght)

if lockFood == 0 then
lockFood = 1
local box = nil
local movingImage = nil

    local Panel = vgui.Create("DPanel")
    _panel = Panel
    Panel:SetSize(410,ScrH()*3/5+210)
    Panel:SetPos(ScrW()/2-205,ScrH()/2 - ScrH()*3/10)
    
local EmotionBox = vgui.Create("DImage", Panel)
box = EmotionBox
    EmotionBox:SetImage("materials/sprites/UI/trial/EmotionBox.png")
    EmotionBox:SetSize(410,ScrH()*3/5)
   -- EmotionBox:SetPos(ScrW()/2-205,ScrH()/2 - ScrH()*3/10)
local ScrollPanel = vgui.Create('DScrollPanel', Panel)
ScrollPanel:SetSize(400,ScrH()*3/5-10)
ScrollPanel:SetPos(0,0)
  --  Panel:SetPos(0,0)
--Panel:DoModal()
Panel:MakePopup()
--Panel:SetKeyboardInputEnabled( true )
Panel.Paint = function (self,w,h)
--draw.RoundedBox(5,0,0,w,h,Color(0,0,0,255))
--draw.RoundedBox(5,5,5,w-10,h-10,Color(0,0,0,50))
end
    local CloseButton= vgui.Create("DButton",Panel)
    CloseButton:SetSize(390,25)
    CloseButton:SetPos(10,ScrH()*3/5+10)
    CloseButton:SetText("Закрыть")
    CloseButton.DoClick = function()
        Panel:Remove()
        lockFood = 0
        end
   
local count = 1
Panel:MoveToBack()
    local clr = Color(0,55,105,100)
                    local single6 = true
for j =0, 10 do
for i=0,2 do
            if count < listlenght then
              --  local SmallPanel = vgui.Create("DPanel",Panel)
            --    SmallPanel:SetSize(110,110)
             --   SmallPanel:SetPos(20+i*125,10+j*125)
             --   SmallPanel:SetText('')
              --  SmallPanel.Paint = function(self,w,h)
--draw.RoundedBox(5,0,0,w,h,clr)
--end
               
local Button = vgui.Create('DImageButton',Panel)
                 ScrollPanel:AddItem(Button)
Button:SetSize(110,110)
Button:SetPos(20+i*125,10+j*125)
Button:SetText('')
Button.Paint = function(self,w,h)
                    Button:SetImage("materials/sprites/food/".. list[j*3+i+1][1]..".png")
--draw.RoundedBox(5,0,0,w,h,clr)
end
                local NamePanel = vgui.Create("DPanel", Button)
                NamePanel :SetPos(0,90)
                NamePanel :SetSize(110,20)
                local Name = vgui.Create("DLabel", NamePanel )
                Name:SetText(list[j*3+i+1][2])
                Name:SetTextColor(Color(0,0,0))
                Name:SetPos(5,0)
                Name:SetSize(110,20)
   --             local Image = vgui.Create('DImage',Button)
 --               Image:SetSize(110,110)
  --  Image:SetImage("materials/sprites/food/".. foodlist[1][i*4+j+1]..".png")

    local NumberOfSprite = count
                    count=count+1
Button.DoClick = function()
                if list == foodlist then
                    foodSearch = true
                    --net.Start("SearchFood")
                    --net.SendToServer()
                    GlobalLenght = 400
                end
                    GlobalTime = list[NumberOfSprite][3]
                    closeButtonFoodMachine = nil
                    Search = 0
                    if list == foodlist then
                        PlayerObservation = GetObservation()*4*(sleep/100)
                    StartWaiting(GlobalTime, 400, GlobalLenght)
                elseif list == waterlist then
                    lockFood = 0
                    net.Start("SetWatercreatorDisabled")
                    net.WriteEntity(ent)
                    net.SendToServer()
                    --timer.Simple(GlobalTime, function ()
                    net.Start("SpawnWater2")
                    net.WriteTable({GlobalTime, NumberOfSprite, ent})
                    --net.WriteFloat(NumberOfSprite)
                    --net.WriteEntity(ent)
                    net.SendToServer()
                    --end)
                end
                if list == vendinglist then
                    net.Start("SetWatercreatorDisabled")
                    net.WriteEntity(ent)
                    net.SendToServer()

                    net.Start("SpawnVending2")
                    net.WriteTable({GlobalTime, NumberOfSprite, ent,tonumber(list[j*3+i+1][2])})
                    net.WriteEntity(LocalPlayer())
                    net.SendToServer()
                end
                    Time = list[NumberOfSprite][3]
                    GlobalNumberOfSprite = NumberOfSprite
                    Globalserversend = serversend
                    Globalent = ent
                       --[[ timer.Simple(list[NumberOfSprite][3], function()
                            
net.Start(serversend)
net.WriteFloat(NumberOfSprite)
net.WriteEntity(ent)
net.SendToServer()
                            
end)]]
Panel:Remove()
--CloseButtonPanel:Remove()
--Emotionclr = Color(255,255,255,100)
      --                  Emotion:SetImageColor(Emotionclr)
  --  Emotionclr = Color(255,255,255,255)  
    end
end
end
end
end
end




net.Receive("SpawnFood", function ()
    ent = net.ReadEntity()
    if foodSearch ~= true then
        OpenFoodList(foodlist, "SpawnFood2",21)
    end
end)
net.Receive("SpawnWater", function ()
    ent = net.ReadEntity()
    OpenFoodList(waterlist, "SpawnWater2",4)
end)
net.Receive("SpawnVending", function ()
    ent = net.ReadEntity()
    OpenFoodList(vendinglist, "SpawnVending2",6)
end)





net.Receive("AmIWantEat",function()
        CanBeHungry = net.ReadBool()
        local food = 100
local water = 100
local sleep = 100
local alcohol = 0
    end)

local function GetFood()
    return food
end
net.Receive("StartSleep", function ()

Isleepnow = true
    end)
    net.Receive("EndSleep", function ()
Isleepnow = false
    end)

    local function restoresleep()
if sleep < 100 and Isleepnow == true then

sleep = sleep + 1
end
    timer.Simple(2, function()
        restoresleep() 
        end)
    end
local postfood = false
local postwater = false
    local function SetStats()
            if food >= 0 and food <= 125 then
                local localfood = ((food*2/1250) - 0.1) * 2
                if food > 100 and postfood then
                localfood = (food*2/1250) * -2
                else
                postfood = false
                localfood = ((food*2/1250) - 0.1) * 2
            end
                net.Start("SetPlayerFood")
                net.WriteEntity(LocalPlayer())
                net.WriteFloat(localfood)
                net.SendToServer()
            elseif food > 126 and food <= 200 then
                local localfood = (food*2/1250) * -2
                postfood = true
                net.Start("SetPlayerFood")
                net.WriteEntity(LocalPlayer())
                net.WriteFloat(localfood)
                net.SendToServer()
            end
            if water >= 0 and water <= 125 then
                local localwater = ((water*2/1250) - 0.1) * 2
                if water > 100 and postwater then
                localwater = (water*2/1250) * -2
                else
                postwater = false
                localwater = ((water*2/1250) - 0.1) * 2
            end
                net.Start("SetPlayerWater")
                net.WriteEntity(LocalPlayer())
                net.WriteFloat(localwater)
                net.SendToServer()
            elseif water > 126 and water <= 200 then
                local localwater = (water*2/1250) * -2
                net.Start("SetPlayerWater")
                net.WriteEntity(LocalPlayer())
                net.WriteFloat(localwater)
                net.SendToServer()
            end
                local localsleep = sleep/100
                net.Start("SetPlayerSleep")
                net.WriteEntity(LocalPlayer())
                net.WriteFloat(localsleep)
                net.SendToServer()
end

net.Receive("EatFood", function ()
        local tbl = net.ReadTable()
        food = food + tbl[1]
        water = water + tbl[2]
        sleep = sleep + tbl[3]
        alcohol = alcohol + (tbl[4]*SoberDrinkMultiple)
        local damage = tbl[5]
        if damage == nil then
            damage = 0
        end
    net.Start("MinusHealth")
    net.WriteFloat(damage)
    net.SendToServer()

    if food > 200 then
        food = 200
    end
        if water > 200 then
        water = 200
    end
        if sleep > 100 then
        sleep = 100
    end
        if alcohol < 0 then
        alcohol = 0
    end
    SetStats()
    end)

local x = Vector( 5, 5, 5 )

hook.Add( "PostDrawTranslucentRenderables", "Boxxie", function()
--[[     local pos = LocalPlayer():GetEyeTrace().HitPos -- position to render box at

    render.SetColorMaterial() -- white material for easy coloring

    cam.IgnoreZ( true ) -- makes next draw calls ignore depth and draw on top
    render.DrawBox( pos, angle_zero, x, -x, color_white ) -- draws the box 
    cam.IgnoreZ( false ) -- disables previous call--]] 
    --local tex = LocalPlayer():GetEyeTrace().Entity:GetMaterial():GetTexture(1)
    --render.BlurRenderTarget( tex, 0, 0, 0 )

end )
--local pattern = Material("pp/texturize/pattern1.png")
--local pattern = Material("makoto/1.png")
--local pattern = Material("sprites/shader/dick.jpg")

local tab = {
    [ "$pp_colour_addr" ] = 0,
    [ "$pp_colour_addg" ] = 0,
    [ "$pp_colour_addb" ] = 0,
    [ "$pp_colour_brightness" ] = 0,
    [ "$pp_colour_contrast" ] = 1,
    [ "$pp_colour_colour" ] = 1,
    [ "$pp_colour_mulr" ] = 0,
    [ "$pp_colour_mulg" ] = 0,
    [ "$pp_colour_mulb" ] = 0
}

local mat_ColorMod = Material( "pp/bokehblur" )


hook.Add( "RenderScreenspaceEffects", "SobelShader", function()

    --DrawSobel( 0.5 )
    --DrawBloom( 0.85, 1, 9, 9, 5, 3, 1, 1, 1 )
    --DrawSharpen( 1.2, 1.2 )
    --DrawSunbeams( 0.3, 0.12, 1, 1.2, 1.2 )
    --DrawSunbeams( 0.1, 0.013, 0.14, 0.2, 0.6 )
    --DrawTexturize( 1, pattern )

    --Посерение экрана при получении по ебалу
    local health = 1
    if LocalPlayer():Health() <= 50 then
        health = LocalPlayer():Health()/50
    end
    if LocalPlayer():Health() <= 0 then
        health = -1
    end
    tab["$pp_colour_colour"] = health
    DrawColorModify( tab )

    --Блюр при бухиче
    --DrawMotionBlur( 0.4, 0.8, 0.01 )
    local SizeOfPizdez = 0.1
    if alcohol < 100 then
    SizeOfPizdez = 0.5 - alcohol/200
else
    SizeOfPizdez = 0.05
end
if alcohol > 0 then
    DrawMotionBlur( SizeOfPizdez, 0.8, 0.01 )
    DrawToyTown(alcohol/5, ScrH())
end
    --render.SetMaterial( mat_ColorMod )
    --render.DrawScreenQuad()

end )

hook.Add("HUDPaint", "f&w", function()
if sawfeelings == true then
    
    draw.SimpleText(LocalPlayer():Health(), "DermaLarge", 50, ScrH()-45, Color( 255, 149,  149, 100 ), TEXT_ALIGN_CENTER, TEXT_ALIGN_TOP)
    draw.SimpleText("Здоровье", "Trebuchet24", 50, ScrH()-70, Color( 255, 255, 255, 100 ), TEXT_ALIGN_CENTER, TEXT_ALIGN_TOP)

    draw.SimpleText("Авторитет", "Trebuchet24", 150, ScrH()-70, Color( 255, 255, 255, 100 ), TEXT_ALIGN_CENTER, TEXT_ALIGN_TOP)
    draw.SimpleText(LocalPlayer():GetNWFloat("Avtoritet"), "DermaLarge", 150, ScrH()-45, Color( 66, 170, 255, 100 ), TEXT_ALIGN_CENTER, TEXT_ALIGN_TOP)
    if CanBeHungry == true then

    draw.SimpleText("Голод", "Trebuchet24", 250, ScrH()-70, Color( 255, 255, 255, 100 ), TEXT_ALIGN_CENTER, TEXT_ALIGN_TOP)
    draw.SimpleText(food, "DermaLarge", 250, ScrH()-45, Color( 255, 223, 154, 100 ), TEXT_ALIGN_CENTER, TEXT_ALIGN_TOP)
    
    draw.SimpleText("Жажда", "Trebuchet24", 350, ScrH()-70, Color( 255, 255, 255, 100 ), TEXT_ALIGN_CENTER, TEXT_ALIGN_TOP)
    draw.SimpleText(water, "DermaLarge", 350, ScrH()-45, Color( 142, 232, 255, 100 ), TEXT_ALIGN_CENTER, TEXT_ALIGN_TOP)
    if CanBeSleepy == true then
    draw.SimpleText("Сон", "Trebuchet24", 450, ScrH()-70, Color( 255, 255, 255, 100 ), TEXT_ALIGN_CENTER, TEXT_ALIGN_TOP)
    draw.SimpleText(sleep, "DermaLarge", 450, ScrH()-45, Color( 255, 254,  213, 100 ), TEXT_ALIGN_CENTER, TEXT_ALIGN_TOP)
    end



end

    
end
    end)
local single6 = true
hook.Add("PlayerButtonDown", "FoodClient", function (ply, button)
    if button == 20 or button == 39 then 
        if single6 == true then
                sawfeelings = !sawfeelings 
                single6 = false
                timer.Simple(0.1, function ()
                    single6 = true
                    end)
            end
            end
        end)



local function gethungry()
    if CanBeHungry == true and Isleepnow == false then
        if ( !LocalPlayer():IsSuperAdmin() and LocalPlayer():GetUserGroup() ~= "spectator") then
            SetStats()
    if food > 0 then
        if food > 125 or CanBeHungry then
food = food - 1
end
end
if food <= 25 then
    net.Start("MinusHealth")
    net.WriteFloat(math.floor((100 - food)/10))
    net.SendToServer()
end
if food > 150 then
    net.Start("MinusHealth")
    net.WriteFloat(math.floor((food-150)/10))
    net.SendToServer()
end
if food > 100 and food <=125 then
    net.Start("MinusHealth")
    net.WriteFloat(math.floor((food-100)/5)*-1)
    net.SendToServer()
    end
end
end
local multiplier = 1
if food > 100 and food <= 150 then
    multiplier = 2
elseif food >150 and food <= 200 then
    multiplier = 4
end
if LocalPlayer():IsValid() then
    if LocalPlayer():GetNWFloat("FoodScaler") > 0 then
        multiplier = multiplier * LocalPlayer():GetNWFloat("FoodScaler")
    end
end
    timer.Simple(((HunglyMultiple*2)/multiplier), function()
        gethungry() 
        end)
    end
local function getthirst()
    if CanBeHungry == true and Isleepnow == false then
        if ( !LocalPlayer():IsSuperAdmin() and LocalPlayer():GetUserGroup() ~= "spectator") then
            SetStats()
if water > 0 then
    if water > 125 or CanBeHungry == true then
water = water - 1
end
end
if water <= 25 then
    net.Start("MinusHealth")
    net.WriteFloat(math.floor((100 - food)/10))
    net.SendToServer()
end
if water > 150 then
    net.Start("MinusHealth")
    net.WriteFloat(math.floor((food-150)/10))
    net.SendToServer()
end
if water > 100 and water <=125 then
    net.Start("MinusHealth")
    net.WriteFloat(math.floor((water-100)/5)*-1)
    net.SendToServer()
    end
end
end
local multiplier = 1
if water > 100 and water <= 150 then
    multiplier = 2
elseif water >150 and water <= 200 then
    multiplier = 4
end
if LocalPlayer():IsValid() then
    if LocalPlayer():GetNWFloat("WaterScaler") > 0 then
        multiplier = multiplier * LocalPlayer():GetNWFloat("WaterScaler")
    end
end
    timer.Simple(((ThirstyMultiple*2)/multiplier), function()
        getthirst() 
        end)
    end


--activator:SetEyeAngles(Angle(0,self:GetAngles().y-90,90))
local alkx = 0
local alky = 0
local function shakecamera2()
    local wtr = 0
    if water < 25 then
        wtr = (25 - water) / 50
    end
    alkx = math.Rand(-alcohol/200 - wtr, alcohol/200 + wtr)
    timer.Simple(0.075, function()
    alky = math.Rand(-alcohol/60 - wtr/3, alcohol/60 + wtr/3)
            end)
    timer.Simple(0.15, function()
            shakecamera2()
        end)
    end
local function shakecamera()
    if alcohol ~= 0 or water < 25 then
    LocalPlayer():SetEyeAngles(Angle(LocalPlayer():GetAngles().x+alkx,LocalPlayer():GetAngles().y+alky,LocalPlayer():GetAngles().z))
        end
    timer.Simple(0.001, function()
            shakecamera()
        end)
    end

local function getsober()
if alcohol > 0 then
alcohol = alcohol - 1
if alcohol > 50 then
    net.Start("MinusHealth")
    net.WriteFloat(math.floor(1))
    net.SendToServer()
    end
end
    timer.Simple(SoberMultiple, function()
        getsober() 
        end)
    end
    local function getsleepy()
        if CanBeHungry == true and Isleepnow == false then
            if CanBeSleepy == true then
            if ( !LocalPlayer():IsSuperAdmin() and LocalPlayer():GetUserGroup() ~= "spectator") then
                SetStats()
                if sleep < 50 then
                local ustalost = (50 - sleep)/50
                LocalPlayer():ScreenFade( SCREENFADE.OUT, Color( 0, 0, 0, 300-sleep*4), ustalost * 2 + 1, 1 )
                --timer.Simple(ustalost * 2 + 1, function ()
                   -- LocalPlayer():ScreenFade( SCREENFADE.PURGE, Color( 0, 0, 0, 200), 1, 0 )
                    timer.Simple(ustalost * 2 + 2, function ()
                    LocalPlayer():ScreenFade( SCREENFADE.IN, Color( 0, 0, 0, 300-sleep*4), ustalost * 2 + 1, 0 )
                --end)
                    end)
                --LocalPlayer():ScreenFade( SCREENFADE.STAYOUT, Color( 0,0,0, ustalost*255),1,0)
               -- else
                --    LocalPlayer():ScreenFade( SCREENFADE.PURGE, Color( 0,0,0, 0),1,0)
                end
if sleep > 0 then
sleep = sleep - 1
else

    net.Start("SendCommandToSleep")
    net.WriteEntity(LocalPlayer())
    net.SendToServer()
    --net.Start("MinusHealth")
    --net.SendToServer()
end
end
end


end
local multiplier = 1
if LocalPlayer():IsValid() then
    if LocalPlayer():GetNWFloat("SleepScaler") > 0 then
        multiplier = multiplier * LocalPlayer():GetNWFloat("SleepScaler")
    end
end
    timer.Simple((SleepMultiple * multiplier), function()
        getsleepy() 
        end)
    end

net.Receive("CanBeHungryOrNot2", function ()
    local bl = net.ReadBool()
    CanBeHungry = bl
    CanBeSleepy = bl
    end)

net.Receive("RestartFood", function ()
    water = 100
    food = 100
    sleep = 100
    end)

--net.Receive("PlayerSpawnedAndHeWantEat", function()
    gethungry()
    getthirst()
    getsleepy()
    getsober()
shakecamera2()
shakecamera()
    restoresleep()
--    end)


local function SetMultiple(one, two, three, four, five)
HunglyMultiple = one
ThirstyMultiple = two
SleepMultiple = three
SoberMultiple = four
SoberDrinkMultiple = five
    end

net.Receive("SetFood", function()
        timer.Simple(0.1, function ()
        --if LocalPlayer():IsSuperAdmin() then
                local   PlayerName
                if(LocalPlayer():IsValid()) then
                    PlayerName = LocalPlayer():Nick()
                end
if PlayerName == "Макото Наеги" or PlayerName == "Макото Наэги" then 
                SetMultiple(30, 20, 45, 10, 3)
        elseif (PlayerName == "Акане Овари" or PlayerName == "Аканэ Овари") then 
            SetMultiple(15, 20, 45, 5, 0.8)
        elseif (PlayerName == "Анджи Йонага" or PlayerName == "Анджи Ёнага") then 
            SetMultiple(45, 30, 60, 15, 1.5)
        elseif PlayerName == "Аой Асахина" then 
            SetMultiple(30, 20, 45, 10, 1.1)
        elseif PlayerName == "Чиаки Нанами" then 
            SetMultiple(45, 30, 15, 15, 1.3)
        elseif (PlayerName == "Селестия Люденбург" or PlayerName == "Селестия Люденбёрг" or PlayerName == "Селестия Люденберг") then 
            SetMultiple(45, 30, 60, 15, 1.5)
        elseif PlayerName == "Бьякуя Тогами" then 
            SetMultiple(45, 30, 60, 15, 0.8)
        elseif PlayerName == "Бьякуя Тoгами" then 
            SetMultiple(15, 20, 45, 5, 0.3)
        elseif PlayerName == "Чихиро Фуджисаки" then 
            SetMultiple(60, 40, 45, 20, 4)
        elseif PlayerName == "Фуюхико Кузурю" then 
            SetMultiple(30, 20, 45, 5, 1.5)
        elseif PlayerName == "Гонта Гокухара" then 
            SetMultiple(30, 20, 45, 5, 0.5)
        elseif PlayerName == "Гандам Танака" then 
            SetMultiple(45, 30, 45, 15, 1)
        elseif (PlayerName == "Хаджиме Хината" or PlayerName == "Хадзиме Хината") then 
            SetMultiple(30, 20, 45, 10, 1)
        elseif (PlayerName == "Изуру Камакура") then 
            SetMultiple(30, 20, 45, 10, 1)
        elseif PlayerName == "Хифуми Ямада" then 
            SetMultiple(30, 20, 60, 10, 0.3)
        elseif PlayerName == "Химико Юмено" then 
            SetMultiple(45, 30, 45, 15, 3)
        elseif (PlayerName == "Хиёко Сайонджи" or PlayerName == "Хиёко Сайондзи")then 
            SetMultiple(45, 30, 45, 15, 2)
        elseif PlayerName == "Ибуки Миода" then 
            SetMultiple(30, 20, 45, 10, 1.2)
        elseif PlayerName == "Джунко Эношима" then 
            SetMultiple(30, 20, 45, 10, 1.1)
        elseif (PlayerName == "K1-B0" or PlayerName == "Киибо"or PlayerName == "Кибо") then 
            SetMultiple(1000000000, 100000000, 90, 0.001, 0)
        elseif (PlayerName == "Каедэ Акаматсу" or PlayerName == "Каэдэ Акаматсу") then 
            SetMultiple(45, 30, 45, 15, 1)
        elseif (PlayerName == "Кайто Момота" or PlayerName == "Каито Момота") then 
            SetMultiple(45, 30, 60, 15, 1.5)
        elseif (PlayerName == "Казуичи Сода" or PlayerName == "Казуити Сода") then 
            SetMultiple(30, 20, 45, 10, 1)
        elseif PlayerName == "Кируми Тоджо" then 
            SetMultiple(45, 30, 60, 15, 0.6)
        elseif (PlayerName == "Киётака Ишимару" or PlayerName == "Кийотака Ишимару") then 
            SetMultiple(30, 20, 60, 10, 1)
        elseif PlayerName == "Кокичи Ома" then 
            SetMultiple(45, 30, 60, 15, 2)
        elseif (PlayerName == "Корекиё Шингуджи" or PlayerName == "Корекие Шингуджи") then 
            SetMultiple(30, 20, 60, 10, 0.8)
        elseif PlayerName == "Кёко Киригири" then 
            SetMultiple(45, 30, 90, 15, 0.9)
        elseif PlayerName == "Леон Кувата" then 
            SetMultiple(30, 20, 60, 10, 1)
        elseif (PlayerName == "Махиру Коидзуми" or PlayerName == "Махиру Коизуми") then 
            SetMultiple(45, 30, 45, 15, 1)
        elseif PlayerName == "Маки Харукава" then 
            SetMultiple(45, 30, 60, 15, 1)
        elseif (PlayerName == "Микан Тсумики" or PlayerName == "Микан Цумики") then 
            SetMultiple(45, 30, 60, 15, 1.3)
        elseif PlayerName == "Миу Ирума" then 
            SetMultiple(45, 30, 90, 15, 0.8)
        elseif PlayerName == "Мондо Овада" then 
            SetMultiple(30, 20, 45, 10, 0.8)
        elseif PlayerName == "Нагито Комаеда" or PlayerName == "Нагито Комаэда" then 
            SetMultiple(45, 30, 45, 15, 4)
        elseif PlayerName == "Некомару Нидай" then 
            SetMultiple(30, 20, 45, 10, 0.3)
        elseif PlayerName == "Пеко Пекояма" then 
            SetMultiple(30, 20, 45, 10, 1)
        elseif PlayerName == "Рантаро Амами" then 
            SetMultiple(45, 30, 60, 15, 1)
        elseif PlayerName == "Рёма Хоши" then 
            SetMultiple(45, 30, 60, 15, 0.5)
        elseif PlayerName == "Сакура Огами" then 
            SetMultiple(15, 20, 45, 5, 0.5)
        elseif (PlayerName == "Саяка Маизоно" or PlayerName == "Саяка Майзоно") then 
            SetMultiple(45, 20, 60, 15, 1.5)
        elseif (PlayerName == "Шуичи Саихара" or PlayerName == "Шуичи Сайхара") then 
            SetMultiple(45, 30, 90, 15, 1)
        elseif (PlayerName == "Сония Невермайнд" or PlayerName == "Соня Невермайнд" or PlayerName == "Сонья Невермайнд") then 
            SetMultiple(45, 30, 60, 15, 1.2)
        elseif PlayerName == "Тенко Чабашира" then 
            SetMultiple(30, 20, 45, 10, 1.2)
        elseif PlayerName == "Терутеру Ханамура" then 
            SetMultiple(30, 20, 45, 10, 0.8)
        elseif PlayerName == "Токо Фукава" then 
            SetMultiple(30, 20, 60, 10, 1)
        elseif (PlayerName == "Тсумуги Широгане" or PlayerName == "Цумуги Широгане" or PlayerName == "Тсумуги Широганэ" or PlayerName == "Цумуги Широганэ") then 
            SetMultiple(45, 30, 45, 15, 1)
        elseif (PlayerName == "Ясухиро Кагакурэ" or PlayerName == "Ясухиро Хагакурэ" or PlayerName == "Ясухиро Кагакуре" or PlayerName == "Ясухиро Хагакуре") then 
            SetMultiple(30, 20, 45, 10, 0.7)
        elseif PlayerName == "Комару Наэги" then 
        SetMultiple(45, 30, 45, 15, 1)
        elseif PlayerName == "Рёко Отонаши" then 
        SetMultiple(30, 20, 45, 10, 1)
        elseif PlayerName == "Рёта Митарай" then 
        SetMultiple(30, 20, 45, 10, 2)
        elseif PlayerName == "Юри Кагарин" then 
        SetMultiple(15, 20, 45, 5, 4)
        elseif PlayerName == "Хаджиме Макуноучи" then 
        SetMultiple(45, 30, 45, 10, 1.2)
        elseif PlayerName == "Кокоро Митсуме" then 
        SetMultiple(30, 20, 60, 10, 2)
        elseif PlayerName == "Эмма Магороби" then 
        SetMultiple(45, 30, 45, 15, 1)
        elseif PlayerName == "Сетсука Чибукуро" then 
        SetMultiple(45, 30, 45, 15, 1)
        elseif PlayerName == "Хибики Отонокоджи" then 
        SetMultiple(30, 20, 45, 10, 1)
        elseif PlayerName == "Канаде Отонокоджи" then 
        SetMultiple(30, 20, 45, 10, 1)
        elseif PlayerName == "Никей Йомиури" then 
        SetMultiple(30, 20, 90, 10, 1)
        elseif PlayerName == "Шинджи Касай" then 
        SetMultiple(45, 30, 60, 15, 0.5)
        elseif PlayerName == "Теруя Отори" then 
        SetMultiple(30, 20, 45, 10, 0.8)
        elseif PlayerName == "Ироха Ниджию" then 
        SetMultiple(30, 20, 30, 10, 4)
        elseif PlayerName == "Сора" then 
        SetMultiple(30, 20, 45, 10, 1)
        elseif PlayerName == "Юки Маеда" then 
        SetMultiple(30, 20, 45, 10, 1)
        elseif PlayerName == "Микадо Санноджи" then 
        SetMultiple(30, 20, 60, 10, 0.8)
        elseif PlayerName == "Шобай Хашимото" then 
        SetMultiple(45, 30, 60, 15, 0.8)
        elseif PlayerName == "Йоруко Кабуя" then 
        SetMultiple(30, 20, 60, 10, 0.9)
        elseif PlayerName == "Сейко Кимуро" then 
        SetMultiple(45, 15, 60, 10, 4)
        elseif PlayerName == "Аюму Фуджимори" then 
        SetMultiple(45, 30, 45, 15, 4)
        elseif PlayerName == "Акира Тсучия" then 
        SetMultiple(45, 20, 30, 15, 1.2)
        elseif PlayerName == "Арума Тодороки" then 
        SetMultiple(30, 20, 60, 10, 0.8)
        elseif PlayerName == "Касуми Изумо" then 
        SetMultiple(30, 20, 90, 10, 1)
        elseif PlayerName == "Казуоми Самеджима" then 
        SetMultiple(45, 30, 45, 15, 1)
        elseif PlayerName == "Кёго Сакума" then 
        SetMultiple(45, 30, 45, 15, 0.5)
        elseif PlayerName == "Майко Кагура" then 
        SetMultiple(20, 15, 45, 7, 1.1)
        elseif PlayerName == "Марин Мизута" then 
        SetMultiple(30, 20, 15, 10, 2)
        elseif PlayerName == "Микото Итсуки" then 
        SetMultiple(30, 20, 60, 10, 0.6)
        elseif PlayerName == "Мисузу Аисака" then 
        SetMultiple(30, 20, 45, 10, 0.9)
        elseif PlayerName == "Митсунари Кога" then 
        SetMultiple(30, 20, 45, 10, 1)
        elseif PlayerName == "Наруми Осоне" then 
        SetMultiple(45, 20, 45, 10, 0.7)
        elseif PlayerName == "Нико Химуро" then 
        SetMultiple(30, 20, 60, 10, 1.3)
        elseif PlayerName == "Cайджи Рокудо" then 
        SetMultiple(30, 20, 45, 10, 1.3)
        elseif PlayerName == "Сейши Йодогава" then 
        SetMultiple(45, 30, 60, 10, 0.5)
            
    else 
            SetMultiple(30, 20, 45, 10, 1)
    --  end
                end
                end)
          end)



--[[local single = true
hook.Add("PlayerButtonDown", "SpawnFoodFaster", function (ply, button)             
    if button == 34 then
        if single == true then
            single = false
            timer.Simple(0.01, function()
                single = true
            end)
            if GlobalTime>0 then
                GlobalLenght = GlobalLenght - 400/GlobalTime
                if GlobalLenght >-10 then
                    print("Бан блять")
                    hook.Add("HUDPaint", "Names3", function()
                        draw.SimpleText("Идёт поиск", "Trebuchet24", ScrW()/2, ScrH()/2-25, Color( 255, 255, 255, 255), TEXT_ALIGN_CENTER, TEXT_ALIGN_TOP)
                        surface.SetDrawColor(Color(255,255,255,255))
                        surface.DrawRect(ScrW()/2-GlobalLenght/2,ScrH()/2,GlobalLenght,22)
                    end)
                end
                GlobalTime = GlobalTime - 1
                Time = Time - 1
            end
        end
    end
end)--]]


net.Receive("EditStats2", function ()
    local stat = net.ReadString()
    if(stat=="food") then
        food = net.ReadFloat()
    end
    if(stat=="water") then
        water = net.ReadFloat()
    end
    if(stat=="sleep") then
        sleep = net.ReadFloat()
    end
    if(stat=="alcohol") then
        alcohol = net.ReadFloat()
    end
    SetStats()
end)


local _NFrame = nil
local function OpenManaTransaction()
    if _NFrame ~= nil then 
        _NFrame:Remove()
    end
    local NFrame = vgui.Create("DFrame")
    _NFrame = NFrame
    NFrame:SetPos(ScrW()*3/8,ScrH()*4/9)
    NFrame:MakePopup()
    NFrame:SetTitle("Вложить ману")
    NFrame:SetSize(500,100)         
    local STextEntry = vgui.Create("DTextEntry", NFrame)
    STextEntry:SetPlaceholderText("")
    STextEntry:SetPos(5, 50)
    STextEntry:SetSize(490, 20)
    local NButton = vgui.Create("DButton", NFrame)
    NButton:SetText("Отправить")
    NButton:SetPos(5, 75)
    NButton:SetSize(490, 20)
    NButton.DoClick = function()
        if tonumber(STextEntry:GetText()) > 0 then
            if tonumber(STextEntry:GetText()) <= LocalPlayer():GetNWFloat("CurrentCyberpsychosis") then
                net.Start("SendMana")
                net.WriteFloat(STextEntry:GetText())
                net.SendToServer()
                NFrame:Remove()
            else
                print("Не хватает маны")
            end
        end 
    end
end

hook.Add("PlayerButtonDown", "Manamenu", function (ply, button)
    if button == 19 then
        OpenManaTransaction()
    end
end)

print('food has been loaded')